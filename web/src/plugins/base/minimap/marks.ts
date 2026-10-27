// ミニマップに描く、ページのアイテムの絵（紙の座標）: 形は定義の minimap（無ければ置いた四角）、つなぐものは種類ごとに定義の minimap（無ければ描かない）。
// つなぐものを先に（下に）、形をあとに（上に）並べる。機能台帳に無い形は、置いた四角
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import type { Point, Rect } from "../../../core/geom"
import { connectorsOf, type ItemPage, type PlacedConnector, shapesOf } from "../../../core/placed"
import { type PortArea, portAreasOf, rectsOf } from "../place/placed"

// ミニマップに描く簡単な絵 1 つ（紙の座標）。色と線の太さはミニマップが決める。
// 四角（rx は角の丸み）・楕円・多角形は塗り、折れ線は線で描く
export type MinimapMark =
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number }
  | { kind: "polygon"; points: readonly Point[] }
  | { kind: "polyline"; points: readonly Point[] }

// ミニマップが読む、定義オブジェクトのメソッド（定義オブジェクトの拡張ポイントに書き足す）
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    // ミニマップに描く絵（rect は置いた形の四角。紙の座標）。無ければ、その四角を描く
    minimap?(item: D, rect: Rect): readonly MinimapMark[]
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    // ミニマップに描く、つなぐもの全部の絵（紙の座標）。引数は bounds と同じ。無ければ描かない
    minimap?(
      lines: readonly D[],
      areas: ReadonlyMap<string, PortArea>,
      setting: (id: string) => unknown,
    ): readonly MinimapMark[]
  }
}

const rectMark = (r: Rect): MinimapMark => ({ kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h })

export function minimapMarks(catalog: CoreCatalog, page: ItemPage, setting: (id: string) => unknown): MinimapMark[] {
  const rects = rectsOf(catalog, page)
  const areas = portAreasOf(catalog, page, rects)
  const marks: MinimapMark[] = []
  const groups = new Map<string, PlacedConnector[]>()
  for (const c of connectorsOf(page)) groups.set(c.item, [...(groups.get(c.item) ?? []), c])
  for (const [id, list] of groups) {
    const def = catalog.items.get(id)
    if (def?.kind === "connector" && def.minimap) marks.push(...def.minimap(list as ConnectorData[], areas, setting))
  }
  for (const s of shapesOf(page)) {
    const r = rects.get(s.id)
    if (!r) continue
    const def = catalog.items.get(s.item)
    marks.push(...(def?.kind === "shape" && def.minimap ? def.minimap(s as ShapeData, r) : [rectMark(r)]))
  }
  return marks
}
