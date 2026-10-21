// ブックを作る: アクション book.create と、それを選ぶダイアログを開くコマンド
import { defineDialog } from "../../../../store/dialogs"

export { BOOK_CREATE } from "./book-create"
export { BOOK_NEW } from "./commands"

export const NEW_BOOK_DIALOG = defineDialog({ id: "book.new" })
