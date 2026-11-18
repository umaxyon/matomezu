// 書庫の画面から出すダイアログ
import { kit } from "../kit"

// フォルダ into（書庫ホームかフォルダ）にブックを作るダイアログ
export const LIBRARY_NEW_BOOK_DIALOG = kit.defineDialogWith<{ into: string }>()({ id: "library-book-new" })
