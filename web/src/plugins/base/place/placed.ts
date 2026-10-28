// 置いた形の大きさ・四角・つながる範囲と、つなぐものの間隔と整え（base の置く計算が使う。ほかのプラグインも使う）。
// 形とつなぐものの定義オブジェクトに、ここで読むフィールドとメソッドを書き足す（定義オブジェクトの拡張ポイント）
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ConnectorData, ConnectorItemDef, ShapeData, ShapeItemDef } from "../../../core/def/item"
import type { Rect, Size } from "../../../core/geom"
import {
  connectorsOf,
  type ItemPage,
  isShape,
  type PlacedConnector,
  type PlacedItem,
  type PlacedShape,
  pageItemsOf,
  shapesOf,
  walkShapes,
} from "../../../core/placed"
import type { Gap } from "./push"

// つなぎ口: つなぐもの（線）が、形のどこにつながるか。書かなければ、形の四角のふち全体
export interface Ports {
  midpoints?: boolean // 辺の真ん中だけにつなぐ（ひし形の頂点のように、辺の途中が形の外になる形）
  insetX?: number // つながる範囲を、左右からこれだけ内側に縮める（左右の辺の真ん中が四角より内側にある形）
  insetY?: number // つながる範囲を、上下からこれだけ内側に縮める
}

// 形のつながる範囲（紙の座標）: つなぎ口で縮めた四角と、辺の真ん中だけにつなぐか
export interface PortArea extends Rect {
  midpoints?: boolean
}

declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    ports?: Ports // つなぎ口（無ければ、四角のふち全体）
    portsOf?(item: D): Ports // 置いた形のデータで変わるつなぎ口（あれば ports より先に使う）
    // 置いたアイテムの大きさ（w・h が無ければ、項目から決まる幅と高さ）。無ければ置いたときの w・h、それも無ければ size
    sizeOf?(item: D): Size
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    gaps?(lines: readonly D[], base: Gap): Gap // つないだ組の間隔の下限（base に重ねる）
    // 形が変わったあとの整え。areas は形のつながる範囲、setting はそのページで効いている設定の値（設定の定義の id から）
    tidy?(lines: readonly D[], areas: ReadonlyMap<string, PortArea>, setting: (id: string) => unknown): D[]
  }
}

// 機能台帳に無いアイテム（プラグインを外したなど）の形の大きさ（データに w・h が無いとき）
export const UNKNOWN_SIZE: Size = { w: 64, h: 64 }

const shapeDef = (catalog: CoreCatalog, item: string): ShapeItemDef | null => {
  const def = catalog.items.get(item)
  return def?.kind === "shape" ? def : null
}
const connectorDef = (catalog: CoreCatalog, item: string): ConnectorItemDef | null => {
  const def = catalog.items.get(item)
  return def?.kind === "connector" ? def : null
}

// 子の形を持つ形の、右と下の端から子までの間
export const NEST_PADDING = 8

// 置いた形の大きさ（機能台帳に無いアイテムは、データの w・h か UNKNOWN_SIZE。形でないアイテムは null）。
// 子の形を持つ形は、自分の大きさ（w・h は下限）と、子がみな入る大きさの大きい方
export function placedSize(catalog: CoreCatalog, item: PlacedShape): Size | null {
  if (!catalog.items.has(item.item)) return { w: item.w ?? UNKNOWN_SIZE.w, h: item.h ?? UNKNOWN_SIZE.h }
  const def = shapeDef(catalog, item.item)
  if (!def) return null
  const own = def.sizeOf?.(item as ShapeData) ?? { w: item.w ?? def.size.w, h: item.h ?? def.size.h }
  if (!def.capabilities.includes("nests") || !item.shapes) return own
  return item.shapes.reduce((size, child) => {
    const c = placedSize(catalog, child as PlacedShape)
    if (!c) return size
    return {
      w: Math.max(size.w, child.x + c.w + NEST_PADDING),
      h: Math.max(size.h, child.y + c.h + NEST_PADDING),
    }
  }, own)
}

// ページの形の四角（大きさの分からない形は入れない。子の形は入れない）
export function rectsOf(catalog: CoreCatalog, page: ItemPage): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  for (const i of shapesOf(page)) {
    const size = placedSize(catalog, i)
    if (size) rects.set(i.id, { x: i.x, y: i.y, ...size })
  }
  return rects
}

// ページの形の四角を、子の形まで（紙の上の位置。大きさの分からない形は入れない）
export function allRectsOf(catalog: CoreCatalog, page: ItemPage): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  for (const { shape, at } of walkShapes(page)) {
    const size = placedSize(catalog, shape)
    if (size) rects.set(shape.id, { ...at, ...size })
  }
  return rects
}

// 置いた形 item のつなぎ口（形の定義の portsOf があればそれ、無ければ ports）
function portsOf(catalog: CoreCatalog, item: PlacedShape): Ports | undefined {
  const def = shapeDef(catalog, item.item)
  return def?.portsOf ? def.portsOf(item as ShapeData) : def?.ports
}

// ページの形のつながる範囲: 形の四角 rects（無ければ子の形までの、紙の上の位置と大きさ）を、形の定義のつなぎ口で縮めたもの。
// 機能台帳に無い形は、四角のふち全体
export function portAreasOf(
  catalog: CoreCatalog,
  page: ItemPage,
  rects: ReadonlyMap<string, Rect> = allRectsOf(catalog, page),
): Map<string, PortArea> {
  const items = new Map(walkShapes(page).map(({ shape }) => [shape.id, shape]))
  const areas = new Map<string, PortArea>()
  for (const [id, r] of rects) {
    const item = items.get(id)
    const ports = item ? portsOf(catalog, item) : undefined
    const ix = Math.min(ports?.insetX ?? 0, Math.max(0, (r.w - 1) / 2))
    const iy = Math.min(ports?.insetY ?? 0, Math.max(0, (r.h - 1) / 2))
    areas.set(id, { x: r.x + ix, y: r.y + iy, w: r.w - ix * 2, h: r.h - iy * 2, midpoints: ports?.midpoints ?? false })
  }
  return areas
}

// つなぐものを種類ごとに分ける（表に無いものは入れない）
function byConnector(catalog: CoreCatalog, page: ItemPage): [ConnectorItemDef, PlacedConnector[]][] {
  const groups = new Map<string, PlacedConnector[]>()
  for (const c of connectorsOf(page)) groups.set(c.item, [...(groups.get(c.item) ?? []), c])
  return [...groups].flatMap(([id, list]) => {
    const def = connectorDef(catalog, id)
    return def ? [[def, list] as [ConnectorItemDef, PlacedConnector[]]] : []
  })
}

// ページの、2 つの形の組の間隔の下限: base に、つなぐものの定義の間隔（gaps）を順に重ねる
export function connectorGaps(catalog: CoreCatalog, page: ItemPage, base: Gap): Gap {
  return byConnector(catalog, page).reduce<Gap>(
    (gap, [def, list]) => def.gaps?.(list as ConnectorData[], gap) ?? gap,
    base,
  )
}

// 形が変わったあとのページ: 端の形が無くなったつなぐものを消し、残りにつなぐものの定義の整え（tidy）を全部かける。
// setting はそのページで効いている設定の値。変わらなければそのまま
export function tidyConnectors<P extends ItemPage>(catalog: CoreCatalog, page: P, setting: (id: string) => unknown): P {
  const groups = byConnector(catalog, page)
  if (groups.length === 0) return page
  const areas = portAreasOf(catalog, page)
  const shapes = new Set(walkShapes(page).map(({ shape }) => shape.id))
  const tidy = new Map<string, PlacedConnector>()
  for (const [def, all] of groups) {
    const list = all.filter(c => shapes.has(c.from) && shapes.has(c.to))
    const next = def.tidy ? def.tidy(list as ConnectorData[], areas, setting) : list
    for (const c of next) tidy.set(c.id, c as PlacedConnector)
  }
  const now = pageItemsOf(page)
  const items = now.flatMap((i): PlacedItem[] => {
    if (isShape(i) || !connectorDef(catalog, i.item)) return [i]
    const c = tidy.get(i.id)
    return c ? [c] : []
  })
  return items.length === now.length && items.every((i, k) => i === now[k]) ? page : { ...page, items }
}
