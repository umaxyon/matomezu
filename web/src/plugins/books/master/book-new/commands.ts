// マスターのコマンド: ブックを作る（作るものはダイアログで決める）
import { actionsOf } from "../../../../plugin-api"
import { kit } from "../kit"

// ブックを作れるのは、アクション book-create を使えるブック（マスター）を開いているとき
export const BOOK_NEW = kit.defineCommand({
  id: "book-new",
  performs: ["@matomezu/master:book-create"],
  title: "New book",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "@matomezu/master:book-new"),
  when: ctx => ctx.book !== null && actionsOf(ctx.catalog, ctx.book).includes("@matomezu/master:book-create"),
})
