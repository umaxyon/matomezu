// ブックを開く: ブックを選ぶダイアログと、それを開くコマンド
import { defineCommand } from "../../../store/commands/def"
import { defineDialog } from "../../../store/dialogs"

export const OPEN_BOOK_DIALOG = defineDialog({ id: "book.open" })

export const BOOK_OPEN = defineCommand({
  id: "book.open",
  title: "Open book",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "book.open"),
  when: () => true,
})
