// ミニマップに描くページの絵（紙の座標）: ブックのタイプの見せ方の minimap が決める（無ければ何も描かない）。
// 置いたアイテムで描く見せ方（紙など）は itemMinimapMarks を使う: 形は定義の minimap（無ければ置いた四角）、つなぐものは種類ごとに定義の minimap（無ければ描かない）。
// つなぐものを先に（下に）、形をあとに（上に）並べる。機能台帳に無い形は、置いた四角。
// つなぐものは、紙が描いた絵（drawn.tsx）があればそれを使う
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import type { Point, Rect } from "../../../core/geom"
import { byConnector, type ItemPage, shapesOf } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { type SettingReader, settingsAt } from "../book-settings"
import type { GrowSides } from "../place/grow"
import { growOf } from "../place/items"
import { type PortArea, portAreasOf, rectsOf, shapeDefOf } from "../place/placed"

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

// 見せ方の minimap が受ける、ページの様子: page で効いている設定の値を読む setting、ページの増やす向き grow（可変ページでなければ undefined）、
// 紙が描いたつなぐものの絵 drawn（種類の id ごと。無ければ undefined）
interface MinimapOn {
  readonly setting: SettingReader
  readonly grow: GrowSides | undefined
  readonly drawn: (item: string) => readonly MinimapMark[] | undefined
}

const rectMark = (r: Rect): MinimapMark => ({ kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h })

// ブック book のページ page の絵。drawn は、紙が描いたつなぐものの絵（種類の id ごと。無ければ定義の minimap で作る）
export function minimapMarks(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  drawn: (item: string) => readonly MinimapMark[] | undefined = () => undefined,
): readonly MinimapMark[] {
  const minimap = catalog.presentations.get(bookType(catalog, book.type).presentation)?.minimap
  if (!minimap) return []
  return minimap(catalog, page, { setting: settingsAt(catalog, book, page), grow: growOf(catalog, book, page), drawn })
}

// 置いたアイテムの絵（見せ方の minimap に、そのまま書ける）
export function itemMinimapMarks(catalog: CoreCatalog, page: ItemPage, { setting, drawn }: MinimapOn): MinimapMark[] {
  const rects = rectsOf(catalog, page)
  const areas = portAreasOf(catalog, page, rects)
  const marks: MinimapMark[] = []
  for (const [def, list] of byConnector(catalog, page)) {
    const shown = drawn(def.id)
    if (shown) {
      marks.push(...shown)
      continue
    }
    if (def.minimap) marks.push(...def.minimap(list as ConnectorData[], areas, setting))
  }
  for (const s of shapesOf(page)) {
    const r = rects.get(s.id)
    if (!r) continue
    const def = shapeDefOf(catalog, s.item)
    marks.push(...(def?.minimap ? def.minimap(s as ShapeData, r) : [rectMark(r)]))
  }
  return marks
}
