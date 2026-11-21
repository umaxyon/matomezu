// ブックを作るコマンド（作るものはダイアログで決める）
import { kit } from "../kit"
import { BOOK_CREATE } from "./book-create"
import { NEW_BOOK_DIALOG } from "./dialog"

// 出すのは、何も開いていないステージ（ブックを探すコンポーネントの上）
export const BOOK_NEW = kit.defineCommand({
  id: "book-new",
  performs: [BOOK_CREATE.id],
  title: "New book",
  run: (_ctx, a) => a.openDialog(NEW_BOOK_DIALOG.id),
  when: ctx => ctx.stage.opened === null,
})
