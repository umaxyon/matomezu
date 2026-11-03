// ディレクトリ構成図のページのミニマップの絵: 行を並べ（layout.ts）、罫線を線で、行を四角で描く（紙の座標。描けない紙と根の無いページは描かない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { type GrowSides, type MinimapMark, paperSize, type SettingReader } from "../../base"
import { DirFolderSchema } from "./entry"
import { layoutDir } from "./layout"

export function dirMinimap(
  catalog: CoreCatalog,
  page: ItemPage,
  _setting: SettingReader,
  grow: GrowSides | undefined,
): MinimapMark[] {
  const root = DirFolderSchema.safeParse("root" in page ? page.root : undefined)
  const paper = paperSize(catalog, page)
  if (!root.success || !paper) return []
  const laid = layoutDir(root.data, paper, undefined, grow !== undefined)
  return [
    ...laid.lines.map((l): MinimapMark => ({ kind: "polyline", points: [l.from, l.to] })),
    ...laid.rows.map((r): MinimapMark => ({ kind: "rect", x: r.x, y: r.y + 4, w: r.w, h: r.h - 8, rx: 2 })),
  ]
}
