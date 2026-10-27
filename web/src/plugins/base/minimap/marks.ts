// ミニマップに描く、ページのアイテムの絵（紙の座標）: 形は定義の minimap（無ければ置いた四角）、つなぐものは種類ごとに定義の minimap（無ければ描かない）。
// つなぐものを先に（下に）、形をあとに（上に）並べる。機能台帳に無い形は、置いた四角
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ConnectorData, MinimapMark, ShapeData } from "../../../core/def/item"
import type { Rect } from "../../../core/geom"
import { connectorsOf, type ItemPage, type PlacedConnector, portAreasOf, rectsOf, shapesOf } from "../../../core/placed"

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
