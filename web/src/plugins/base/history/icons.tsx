// 履歴のコマンドのアイコン（元に戻すは左へ戻る矢印、やり直すは右へ進む矢印）
import { icon } from "../icon"
import { REDO, UNDO } from "."

export const UNDO_ICON = icon(<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />)
export const REDO_ICON = icon(<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />)

export const HISTORY_ICONS = {
  [UNDO.id]: UNDO_ICON,
  [REDO.id]: REDO_ICON,
}
