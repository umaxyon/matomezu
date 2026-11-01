// ツリーのビュー: ページごとの木を描く。画面の上の右クリックでツリーのメニュー（tree-context）、節の右クリックで節のメニュー（node-context）を開く。
// 編集の道具で選ぶ節が替わると、選んだ節を真ん中に持ってくる紙の動きをなめらかにする
import type { BookViewDef } from "../../../../plugin-api/ui"
import { EDIT_TOOL } from "../tools"
import { NODE_CONTEXT, TREE_CONTEXT } from "../tree"
import { TreeView } from "./TreeView"

export const TREE_VIEW = {
  view: TreeView,
  contextMenus: [TREE_CONTEXT, NODE_CONTEXT],
  motion: stage => (stage.tool === EDIT_TOOL.id ? (stage.selection[0] ?? "") : ""),
} as const satisfies BookViewDef
