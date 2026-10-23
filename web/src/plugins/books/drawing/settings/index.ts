// ブックの設定とページの設定: 設定のダイアログと、それを開くコマンド（図面のブックを開いているときだけ出す。ブックの設定は右クリックのメニューとブックの名前の欄のメニュー、
// ページの設定は右クリックのメニューに置く）
import { defineCommand } from "../../../../store/commands/def"
import { defineDialog, defineDialogWith } from "../../../../store/dialogs"
import { usesLines } from "../line"

export const DRAWING_SETTINGS_DIALOG = defineDialog({ id: "drawing.settings" })

export const DRAWING_SETTINGS = defineCommand({
  id: "drawing.settings",
  title: "Book settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "drawing.settings"),
  when: ctx => ctx.book?.type === "drawing",
})

// ページの設定のダイアログ。開いたステージのブックの、ページ page の設定を変える
export const PAGE_SETTINGS_DIALOG = defineDialogWith<{ page: string }>()({ id: "page.settings" })

// 開いているページの設定のダイアログを開く（設定は線の既定の通り方だけなので、線が使えるブックだけ）
export const PAGE_SETTINGS = defineCommand({
  id: "page.settings",
  title: "Page settings",
  run: (ctx, a) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, "page.settings", { page })
  },
  when: ctx => ctx.book?.type === "drawing" && ctx.stage.opened?.page != null && usesLines(ctx.registry, ctx.book),
})
