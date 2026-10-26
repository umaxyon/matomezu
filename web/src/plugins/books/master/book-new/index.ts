import { kit } from "../kit"

// ブックを作る: アクション book-create と、それを選ぶダイアログを開くコマンド

export { BOOK_CREATE } from "./book-create"
export { BOOK_NEW } from "./commands"

export const NEW_BOOK_DIALOG = kit.defineDialog({ id: "book-new" })
