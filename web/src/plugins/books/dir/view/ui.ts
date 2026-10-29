// ディレクトリ構成図のビュー: ページごとの紙と、その上の中身を描く。画面の上の右クリックでディレクトリ構成図のメニュー（dir-context）、鉛筆の間に行の右クリックで行のメニュー（entry-context）を開く
import type { BookViewDef } from "../../../../plugin-api/ui"
import { DIR_CONTEXT, ENTRY_CONTEXT } from "../dir"
import { DirView } from "./DirView"

export const DIR_VIEW = {
  view: DirView,
  contextMenus: [DIR_CONTEXT, ENTRY_CONTEXT],
} as const satisfies BookViewDef
