// ページ: ページを作る・開くコマンドと、ページを作るダイアログ（作るものはダイアログで決める）。ページの設定のダイアログと、それを開くコマンド
import { hasPages } from "../../../core/book"
import { settingDefs } from "../../../core/book-settings"
import { actionsOf } from "../../../core/perform"
import { defineCommand } from "../../../store/commands/def"
import { defineDialog, defineDialogWith } from "../../../store/dialogs"

export { PAGE_ADD } from "./page-add"

export const NEW_PAGE_DIALOG = defineDialog({ id: "page.new" })

export const PAGE_NEW = defineCommand({
  id: "page.new",
  title: "New page",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "page.new"),
  when: ctx => ctx.book !== null && hasPages(ctx.book) && actionsOf(ctx.registry, ctx.book).includes("page.add"),
})

export const PAGE_OPEN = defineCommand({
  id: "page.open",
  title: "Open page",
  run: (ctx, a, page: string) => a.openPage(ctx.stage.id, page),
  when: ctx => ctx.book !== null && hasPages(ctx.book),
})

// ページの設定のダイアログ。開いたステージのブックの、ページ page の設定の項目を変える
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
