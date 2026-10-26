// ブックを作るコマンド（作るものはダイアログで決める）
import { actionsOf } from "../../../core/perform"
import { kit } from "../kit"

// 出すのは、アクション book-create を足したタイプのブック（マスターなど）を開いているとき
export const BOOK_NEW = kit.defineCommand({
  id: "book-new",
  performs: ["@matomezu/base:book-create"],
  title: "New book",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "@matomezu/base:book-new"),
  when: ctx => ctx.book !== null && actionsOf(ctx.catalog, ctx.book).includes("@matomezu/base:book-create"),
})
