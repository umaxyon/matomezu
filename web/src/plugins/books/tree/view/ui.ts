// ツリーのビュー: ページごとの紙と、その上の木を描く。画面の上の右クリックでツリーのメニュー（tree-context）、節の右クリックで節のメニュー（node-context）を開く
import type { BookViewDef } from "../../../../plugin-api/ui"
import { NODE_CONTEXT, TREE_CONTEXT } from "../tree"
import { TreeView } from "./TreeView"

export const TREE_VIEW = {
  view: TreeView,
  contextMenus: [TREE_CONTEXT, NODE_CONTEXT],
} as const satisfies BookViewDef
