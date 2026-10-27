// ブックを作るコマンド（作るものはダイアログで決める）
import { actionsOf } from "../../../core/perform"
import { kit } from "../kit"
import { BOOK_CREATE } from "./book-create"
import { NEW_BOOK_DIALOG } from "./dialog"

// 出すのは、アクション book-create を足したタイプのブック（マスターなど）を開いているとき
export const BOOK_NEW = kit.defineCommand({
  id: "book-new",
  performs: [BOOK_CREATE.id],
  title: "New book",
  run: (ctx, a) => a.openDialog(ctx.stage.id, NEW_BOOK_DIALOG.id),
  when: ctx => ctx.book !== null && actionsOf(ctx.catalog, ctx.book).includes(BOOK_CREATE.id),
})
