// ブックの設定とページの設定: 設定のダイアログと、それを開くコマンド（ブックの設定は右クリックのメニューとブックの名前の欄のメニュー、
// ページの設定は右クリックのメニューに置く）
import { settingDefs } from "../../../../core/book-settings"
import { actionsOf } from "../../../../core/perform"
import { defineCommand } from "../../../../store/commands/def"
import { defineDialog, defineDialogWith } from "../../../../store/dialogs"

export const DRAWING_SETTINGS_DIALOG = defineDialog({ id: "drawing.settings" })

export const DRAWING_SETTINGS = defineCommand({
  id: "drawing.settings",
  title: "Book settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "drawing.settings"),
  // ブックのタイプが book.update を使える（名前と見た目を変えられる）ブックだけ
  when: ctx => ctx.book !== null && actionsOf(ctx.registry, ctx.book).includes("book.update"),
})

// ページの設定のダイアログ。開いたステージのブックの、ページ page の設定を変える
export const PAGE_SETTINGS_DIALOG = defineDialogWith<{ page: string }>()({ id: "page.settings" })

// 開いているページの設定のダイアログを開く（ブックのタイプが page.update を使え、ページの設定の項目を選んでいるブックだけ）
export const PAGE_SETTINGS = defineCommand({
  id: "page.settings",
  title: "Page settings",
  run: (ctx, a) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, "page.settings", { page })
  },
  when: ctx =>
    ctx.book !== null &&
    ctx.stage.opened?.page != null &&
    actionsOf(ctx.registry, ctx.book).includes("page.update") &&
    settingDefs(ctx.registry, ctx.book.type, "page").length > 0,
})
