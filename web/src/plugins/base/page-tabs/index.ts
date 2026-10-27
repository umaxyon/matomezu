// ページ: ページを作る・開くコマンドと、ページを作るダイアログ（作るものはダイアログで決める）。ページの設定のダイアログと、それを開くコマンド
import { hasPages } from "../../../core/book"
import { settingDefs } from "../book-settings"
import { kit } from "../kit"
import { PAGE_ADD } from "./page-add"
import { PAGE_UPDATE } from "./page-update"

export { PAGE_ADD } from "./page-add"

export const NEW_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

export const PAGE_NEW = kit.defineCommand({
  id: "page-new",
  performs: [PAGE_ADD.id],
  title: "New page",
  run: (ctx, a) => a.openDialog(ctx.stage.id, NEW_PAGE_DIALOG.id),
  when: () => true,
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
  performs: [PAGE_UPDATE.id],
  title: "Page settings",
  run: (ctx, a) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, PAGE_SETTINGS_DIALOG.id, { page })
  },
  when: ctx =>
    ctx.book !== null && ctx.stage.opened?.page != null && settingDefs(ctx.catalog, ctx.book.type, "page").length > 0,
})
