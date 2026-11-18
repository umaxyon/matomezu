import { kit } from "../kit"
// ブックを開く: ブックを選ぶダイアログと、それを開くコマンド

export const OPEN_BOOK_DIALOG = kit.defineDialog({ id: "book-open" })

export const BOOK_OPEN = kit.defineCommand({
  id: "book-open",
  title: "Open book",
  run: (_ctx, a) => a.openDialog(OPEN_BOOK_DIALOG.id),
  when: () => true,
})
