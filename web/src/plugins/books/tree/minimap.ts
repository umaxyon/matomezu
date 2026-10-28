// ツリーのページのミニマップの絵: 木を並べ（layout.ts）、親から子への線を両端を結ぶ線で、節を四角で描く（紙の座標。描けない紙と根の無いページは描かない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import { type MinimapMark, paperSize } from "../../base"
import { GROW } from "./grow"
import { layoutTree } from "./layout"
import { TreeRootSchema } from "./node"
import { DEFAULT_NODE_SHAPE, NODE_SHAPE } from "./shape"
import { DEFAULT_NODE_SIZE, NODE_SIZE } from "./size"

// setting は、そのページで効いている設定の値を読む関数
export function treeMinimap(catalog: CoreCatalog, page: ItemPage, setting: (id: string) => unknown): MinimapMark[] {
  const root = TreeRootSchema.safeParse("root" in page ? page.root : undefined)
  const paper = paperSize(catalog, page)
  if (!root.success || !paper) return []
  const grow = GROW.schema.safeParse(setting(GROW.id)).data ?? "down"
  const size = NODE_SIZE.schema.safeParse(setting(NODE_SIZE.id)).data ?? DEFAULT_NODE_SIZE
  const shape = NODE_SHAPE.schema.safeParse(setting(NODE_SHAPE.id)).data ?? DEFAULT_NODE_SHAPE
  const laid = layoutTree(root.data, grow, paper, size, shape)
  return [
    ...laid.lines.map((l): MinimapMark => ({ kind: "polyline", points: [l.from, l.to] })),
    ...laid.nodes.map((n): MinimapMark => ({ kind: "rect", x: n.x, y: n.y, w: n.w, h: n.h, rx: 2 })),
  ]
}
