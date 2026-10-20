// ダイアログ。定義は id だけを持ち、中身（ビュー）は ui が id に結ぶ（画面の無い app でも、コマンドがダイアログを開けるように）。
// 画面に出すダイアログは 1 つだけで、どれを出すかは id、どこから開いたかは stage で決まる
import type { DialogId } from "./tables"

export interface DialogDef {
  id: string
}

export const defineDialog = <const Id extends string>(def: DialogDef & { id: Id }): DialogDef & { id: Id } => def

export const OPEN_BOOK_DIALOG = defineDialog({ id: "book.open" })
export const NEW_BOOK_DIALOG = defineDialog({ id: "book.new" })
export const NEW_PAGE_DIALOG = defineDialog({ id: "page.new" })
export const DIALOGS = [OPEN_BOOK_DIALOG, NEW_BOOK_DIALOG, NEW_PAGE_DIALOG] as const

declare module "./tables" {
  interface DialogTable {
    "book.open": typeof OPEN_BOOK_DIALOG
    "book.new": typeof NEW_BOOK_DIALOG
    "page.new": typeof NEW_PAGE_DIALOG
  }
}

export interface OpenedDialog {
  id: DialogId
  stage: string // 開いたステージ。ダイアログの操作はこのステージに向ける
}
