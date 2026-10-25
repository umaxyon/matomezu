// マスターのコマンド: ブックを作る（作るものはダイアログで決める）
import { actionsOf } from "../../../../core/perform"
import { defineCommand } from "../../../../store/commands/def"

// ブックを作れるのは、アクション book.create を使えるブック（マスター）を開いているとき
export const BOOK_NEW = defineCommand({
  id: "book.new",
  title: "New book",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "book.new"),
  when: ctx => ctx.book !== null && actionsOf(ctx.catalog, ctx.book).includes("book.create"),
})
