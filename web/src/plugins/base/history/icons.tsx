// 履歴のコマンドのアイコン（元に戻すは左へ戻る矢印、やり直すは右へ進む矢印。書庫の画面の履歴のコマンドも同じ絵）
import { icon } from "../icon"
import { LIBRARY_REDO, LIBRARY_UNDO } from "../library/commands"
import { REDO, UNDO } from "."

const UNDO_ICON = icon(<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />)
const REDO_ICON = icon(<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />)

export const HISTORY_ICONS = {
  [UNDO.id]: UNDO_ICON,
  [REDO.id]: REDO_ICON,
  [LIBRARY_UNDO.id]: UNDO_ICON,
  [LIBRARY_REDO.id]: REDO_ICON,
}
