// ブックの設定: 設定のダイアログと、それを開くコマンド（図面のブックを開いているときだけ出す。右クリックのメニューとブックの名前の欄のメニューに置く）
import { defineCommand } from "../../../../store/commands/def"
import { defineDialog } from "../../../../store/dialogs"

export const DRAWING_SETTINGS_DIALOG = defineDialog({ id: "drawing.settings" })

export const DRAWING_SETTINGS = defineCommand({
  id: "drawing.settings",
  title: "Book settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "drawing.settings"),
  when: ctx => ctx.book?.type === "drawing",
})
