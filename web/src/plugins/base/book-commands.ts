// ブックとページのコマンド: ブックを開く・作る、ページを作る・開く。作るものはダイアログで決める
import { hasPages } from "../../core/book"
import { actionsOf } from "../../core/perform"
import { defineCommand } from "../../store/commands/def"

export const BOOK_OPEN = defineCommand({
  id: "book.open",
  title: "ブックを開く",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "book.open"),
  when: () => true,
})

// ブックを作れるのは、アクション book.create を使えるブック（マスター）を開いているとき
export const BOOK_NEW = defineCommand({
  id: "book.new",
  title: "新しいブック",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "book.new"),
  when: ctx => ctx.book !== null && actionsOf(ctx.registry, ctx.book).includes("book.create"),
})

export const PAGE_NEW = defineCommand({
  id: "page.new",
  title: "新しいページ",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "page.new"),
  when: ctx => ctx.book !== null && hasPages(ctx.book) && actionsOf(ctx.registry, ctx.book).includes("page.add"),
})

export const PAGE_OPEN = defineCommand({
  id: "page.open",
  title: "ページを開く",
  run: (ctx, a, page: string) => a.openPage(ctx.stage.id, page),
  when: ctx => ctx.book !== null && hasPages(ctx.book),
})
