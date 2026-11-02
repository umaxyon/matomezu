// ツリーのページのミニマップの絵: 木を並べ（layout.ts）、親から子への線を両端を結ぶ線で、節を四角で描く（紙の座標。描けない紙と根の無いページは描かない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { type MinimapMark, paperSize, type SettingReader } from "../../base"
import { GROW, growSidesOf } from "./grow"
import { layoutTree } from "./layout"
import { TreeRootSchema } from "./node"
import { NODE_SHAPE } from "./shape"
import { NODE_SIZE } from "./size"

// setting は、そのページで効いている設定の値を読む関数
export function treeMinimap(catalog: CoreCatalog, page: ItemPage, setting: SettingReader): MinimapMark[] {
  const root = TreeRootSchema.safeParse("root" in page ? page.root : undefined)
  const paper = paperSize(catalog, page)
  if (!root.success || !paper) return []
  const grow = setting(GROW)
  const size = setting(NODE_SIZE)
  const shape = setting(NODE_SHAPE)
  const laid = layoutTree(root.data, grow, paper, size, shape, page.grows !== undefined ? growSidesOf(grow) : undefined)
  return [
    ...laid.lines.map((l): MinimapMark => ({ kind: "polyline", points: [l.from, l.to] })),
    ...laid.nodes.map((n): MinimapMark => ({ kind: "rect", x: n.x, y: n.y, w: n.w, h: n.h, rx: 2 })),
  ]
}
