// ツリーのページのミニマップの絵: 木を並べ（layout.ts）、親から子への線を両端を結ぶ線で、節を四角で描く（紙の座標。描けない紙と根の無いページは描かない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { type GrowSides, type MinimapMark, paperSize, type SettingReader } from "../../base"
import { GROW } from "./grow"
import { layoutTree } from "./layout"
import { treeRootOf } from "./node"
import { NODE_SHAPE } from "./shape"
import { NODE_SIZE } from "./size"

// 見せ方の minimap。setting は、そのページで効いている設定の値を読む関数。grow はページの増やす向き（可変ページでなければ undefined）
export function treeMinimap(
  catalog: CoreCatalog,
  page: ItemPage,
  { setting, grow }: { setting: SettingReader; grow: GrowSides | undefined },
): MinimapMark[] {
  const root = treeRootOf(page)
  const paper = paperSize(catalog, page)
  if (!root || !paper) return []
  const size = setting(NODE_SIZE)
  const shape = setting(NODE_SHAPE)
  const laid = layoutTree(root, setting(GROW), paper, size, shape, grow)
  return [
    ...laid.lines.map((l): MinimapMark => ({ kind: "polyline", points: [l.from, l.to] })),
    ...laid.nodes.map((n): MinimapMark => ({ kind: "rect", x: n.x, y: n.y, w: n.w, h: n.h, rx: 2 })),
  ]
}
