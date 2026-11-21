// ディレクトリ構成図のビュー: ページごとの紙と、その上の中身を描く。画面の上の右クリックでディレクトリ構成図のメニュー（dir-context）、鉛筆の間に行の右クリックで行のメニュー（node-context）を開く
import type { PresentationViewDef } from "../../../../plugin-api/ui"
import { DIR_CONTEXT, NODE_CONTEXT } from "../dir"
import { DirSheet } from "./DirSheet"
import { DirView } from "./DirView"

export const DIR_VIEW = {
  view: DirView,
  printSheet: DirSheet,
  contextMenus: [DIR_CONTEXT, NODE_CONTEXT],
} as const satisfies PresentationViewDef
