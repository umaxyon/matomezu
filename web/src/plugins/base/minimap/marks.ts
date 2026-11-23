// ミニマップに描くページの絵（紙の座標）: ページのタイプのプレゼンテーションの minimap が決める（無ければ何も描かない）。
// 置いたアイテムで描くプレゼンテーション（紙など）は itemMinimapMarks を使う: 形は定義の minimap（無ければ置いた四角）、つなぐものは種類ごとに定義の minimap（無ければ描かない）。
// つなぐものを先に（下に）、形をあとに（上に）並べる。機能台帳に無い形は、置いた四角。
// つなぐものは、紙が描いた絵（drawn.tsx）があればそれを使う
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import { slideIsBackground } from "../../../core/def/page-type"
import type { Point, Rect } from "../../../core/geom"
import { byConnector, type ItemPage, shapesOf, slideOf } from "../../../core/placed"
import { type SettingReader, settingsAt } from "../book-settings"
import { type GrowSides, growOf, type NO_GROW } from "../place/grow"
import { NO_SHAPE_DEF, NO_SIZE, type PortArea, placedSize, portAreasOf, rectsOf, shapeDefOf } from "../place/placed"

// ミニマップに描く簡単な絵 1 つ（紙の座標）。色と線の太さはミニマップが決める。
// 四角（rx は角の丸み）・楕円・多角形は塗り、折れ線は線で描く
export type MinimapMark =
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number }
  | { kind: "polygon"; points: readonly Point[] }
  | { kind: "polyline"; points: readonly Point[] }

// ミニマップが読む、定義オブジェクトのメソッド（定義オブジェクトの拡張ポイントに書き足す）
declare module "../../../core/catalog" {
  interface PresentationExtras {
    // ページ page に描く絵（紙の座標。無ければ何も描かない）
    minimap?(catalog: CoreCatalog, page: ItemPage, on: MinimapOn): readonly MinimapMark[]
  }
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    // ミニマップに描く絵（rect は置いた形の四角。紙の座標）。無ければ、その四角を描く
    minimap?(item: D, rect: Rect): readonly MinimapMark[]
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    // ミニマップに描く、つなぐもの全部の絵（紙の座標）。引数は bounds と同じ。無ければ描かない
    minimap?(lines: readonly D[], areas: ReadonlyMap<string, PortArea>, setting: SettingReader): readonly MinimapMark[]
  }
}

// プレゼンテーションの minimap が受ける、ページの様子: page で効いている設定の値を読む setting、ページの増やす向き grow（可変ページでなければ NO_GROW）、
// 紙が描いたつなぐものの絵 drawn（種類の id ごと。無ければ undefined）
interface MinimapOn {
  readonly setting: SettingReader
  readonly grow: GrowSides | typeof NO_GROW
  readonly drawn: (item: string) => readonly MinimapMark[] | typeof NOT_DRAWN // 紙が描いたつなぐものの絵（描いていなければ NOT_DRAWN）
}

// 紙がつなぐものの絵を描いていないときの値（MinimapOn の drawn）
export const NOT_DRAWN = "none"

const rectMark = (r: Rect): MinimapMark => ({ kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h })

// ページ page の絵。drawn は、紙が描いたつなぐものの絵（種類の id ごと。無ければ定義の minimap で作る）
export function minimapMarks(
  catalog: CoreCatalog,
  page: ItemPage,
  drawn: (item: string) => readonly MinimapMark[] | typeof NOT_DRAWN = () => NOT_DRAWN,
): readonly MinimapMark[] {
  const type = pageType(catalog, page.type)
  const minimap = catalog.presentations.get(type.presentation)?.minimap
  if (!minimap) return []
  // 背景（ページの slide。背景を持つタイプ）は、ミニマップに描かない（中身の位置の目印）
  const shown = slideIsBackground(type) ? { ...page, slide: undefined } : page
  return minimap(catalog, shown, { setting: settingsAt(catalog, page), grow: growOf(catalog, page), drawn })
}

// 置いたアイテムの絵（ページの slide の形も含む。背景は minimapMarks が外す。プレゼンテーションの minimap に、そのまま書ける）
export function itemMinimapMarks(catalog: CoreCatalog, page: ItemPage, { setting, drawn }: MinimapOn): MinimapMark[] {
  const rects = rectsOf(catalog, page)
  const areas = portAreasOf(catalog, page, rects)
  const marks: MinimapMark[] = []
  for (const [def, list] of byConnector(catalog, page)) {
    const shown = drawn(def.id)
    if (shown !== NOT_DRAWN) {
      marks.push(...shown)
      continue
    }
    if (def.minimap) marks.push(...def.minimap(list as ConnectorData[], areas, setting))
  }
  for (const s of shapesOf(page)) {
    const r = rects.get(s.id)
    if (!r) continue
    const def = shapeDefOf(catalog, s.item)
    marks.push(...(def !== NO_SHAPE_DEF && def.minimap ? def.minimap(s as ShapeData, r) : [rectMark(r)]))
  }
  // ページの slide の形（重ねの順に、items の上へ）
  for (const s of slideOf(page)) {
    const size = placedSize(catalog, s)
    if (size === NO_SIZE) continue
    const r = { x: s.x, y: s.y, ...size }
    const def = shapeDefOf(catalog, s.item)
    marks.push(...(def !== NO_SHAPE_DEF && def.minimap ? def.minimap(s as ShapeData, r) : [rectMark(r)]))
  }
  return marks
}
