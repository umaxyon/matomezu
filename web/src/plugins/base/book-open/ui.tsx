// ブックを開くの見た目: ブックを選ぶダイアログと、コマンドのアイコン
import { icon } from "../icon"
import { OpenBookDialog } from "./OpenBookDialog"

export const BOOK_OPEN_DIALOG_VIEWS = { "book.open": OpenBookDialog }

export const BOOK_OPEN_ICONS = {
  "book.open": icon(<path d="M3.5 5.5h6l2 2h9v11h-17z" />),
}
