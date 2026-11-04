// ディレクトリ構成図のページのミニマップの絵: 行を並べ（layout.ts）、罫線を線で、行を四角で描く（紙の座標。描けない紙と根の無いページは描かない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { type GrowSides, type MinimapMark, paperSize } from "../../base"
import { dirRootOf } from "./entry"
import { layoutDir } from "./layout"

export function dirMinimap(
  catalog: CoreCatalog,
  page: ItemPage,
  { grow }: { grow: GrowSides | undefined },
): MinimapMark[] {
  const root = dirRootOf(page)
  const paper = paperSize(catalog, page)
  if (!root || !paper) return []
  const laid = layoutDir(root, paper, undefined, grow !== undefined)
  return [
    ...laid.lines.map((l): MinimapMark => ({ kind: "polyline", points: [l.from, l.to] })),
    ...laid.rows.map((r): MinimapMark => ({ kind: "rect", x: r.x, y: r.y + 4, w: r.w, h: r.h - 8, rx: 2 })),
  ]
}
