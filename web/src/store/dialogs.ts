// 開いているダイアログ。画面に出すダイアログは 1 つだけで、どれを出すかは id、どこから開いたかは stage で決まる。
// id ごとの中身は ui の DIALOG_VIEWS が描く
export const DIALOG_IDS = ["book.open", "book.new", "page.new"] as const
export type DialogId = (typeof DIALOG_IDS)[number]

export interface OpenedDialog {
  id: DialogId
  stage: string // 開いたステージ。ダイアログの操作はこのステージに向ける
}
