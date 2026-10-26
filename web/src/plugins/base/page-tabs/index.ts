// ページ: ページを作る・開くコマンドと、ページを作るダイアログ（作るものはダイアログで決める）。ページの設定のダイアログと、それを開くコマンド
import { hasPages } from "../../../core/book"
import { settingDefs } from "../../../core/book-settings"
import { actionsOf } from "../../../core/perform"
import { kit } from "../kit"

export { PAGE_ADD } from "./page-add"

export const NEW_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

export const PAGE_NEW = kit.defineCommand({
  id: "page-new",
  title: "New page",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "@matomezu/base:page-new"),
  when: ctx =>
    ctx.book !== null && hasPages(ctx.book) && actionsOf(ctx.catalog, ctx.book).includes("@matomezu/base:page-add"),
})

export const PAGE_OPEN = kit.defineCommand({
  id: "page-open",
  title: "Open page",
  run: (ctx, a, page: string) => a.openPage(ctx.stage.id, page),
  when: ctx => ctx.book !== null && hasPages(ctx.book),
})

// ページの設定のダイアログ。開いたステージのブックの、ページ page の設定の項目を変える
export const PAGE_SETTINGS_DIALOG = kit.defineDialogWith<{ page: string }>()({ id: "page-settings" })

// 開いているページの設定のダイアログを開く（ブックのタイプが page-update を使え、ページの設定の項目を選んでいるブックだけ）
export const PAGE_SETTINGS = kit.defineCommand({
  id: "page-settings",
  title: "Page settings",
  run: (ctx, a) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, "@matomezu/base:page-settings", { page })
  },
  when: ctx =>
    ctx.book !== null &&
    ctx.stage.opened?.page != null &&
    actionsOf(ctx.catalog, ctx.book).includes("@matomezu/base:page-update") &&
    settingDefs(ctx.catalog, ctx.book.type, "page").length > 0,
})
