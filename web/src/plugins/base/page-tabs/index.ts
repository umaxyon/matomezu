// ページ: ページを作る・開くコマンドと、ページを作るダイアログ。作るものはダイアログで決める
import { hasPages } from "../../../core/book"
import { actionsOf } from "../../../core/perform"
import { defineCommand } from "../../../store/commands/def"
import { defineDialog } from "../../../store/dialogs"

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
