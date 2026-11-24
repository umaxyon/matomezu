// 書庫の画面から出すダイアログ
import { kit } from "../kit"

// フォルダ into（書庫ホームかフォルダ）にブックを作るダイアログ
export const LIBRARY_NEW_BOOK_DIALOG = kit.defineDialogWith<{ into: string }>()({ id: "library-book-new" })
// フォルダ into（書庫ホームかフォルダ）にフォルダを作るダイアログ
export const LIBRARY_NEW_FOLDER_DIALOG = kit.defineDialogWith<{ into: string }>()({ id: "library-folder-new" })
// エントリ entry の名前を変えるダイアログ
export const LIBRARY_RENAME_DIALOG = kit.defineDialogWith<{ entry: string }>()({ id: "library-entry-rename" })
// ブックやバインダの中のエントリ entry を消す前に確かめるダイアログ
export const LIBRARY_REMOVE_DIALOG = kit.defineDialogWith<{ entry: string }>()({ id: "library-entry-remove" })
