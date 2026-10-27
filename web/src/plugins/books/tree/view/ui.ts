// ツリーのビュー: ページごとの紙と、その上の木を描く。画面の上の右クリックでツリーのメニュー（tree-context）を開く
import type { BookViewDef } from "../../../../plugin-api/ui"
import { TREE_CONTEXT } from "../tree"
import { TreeView } from "./TreeView"

export const TREE_VIEW = {
  view: TreeView,
  contextMenus: [TREE_CONTEXT],
} as const satisfies BookViewDef
