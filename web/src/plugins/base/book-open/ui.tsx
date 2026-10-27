// ブックを開くの見た目: ブックを選ぶダイアログと、コマンドのアイコン
import { icon } from "../icon"
import { BOOK_OPEN, OPEN_BOOK_DIALOG } from "."
import { OpenBookDialog } from "./OpenBookDialog"

export const BOOK_OPEN_DIALOG_VIEWS = { [OPEN_BOOK_DIALOG.id]: OpenBookDialog }

export const BOOK_OPEN_ICONS = {
  [BOOK_OPEN.id]: icon(<path d="M3.5 5.5h6l2 2h9v11h-17z" />),
}
