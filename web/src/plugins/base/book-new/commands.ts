// ブックを作るコマンド（作るものはダイアログで決める）
import { NO_BOOK } from "../../../store/commands/def"
import { kit } from "../kit"
import { BOOK_CREATE } from "./book-create"
import { NEW_BOOK_DIALOG } from "./dialog"

// 出すのは、ブックを開いていないステージ（ブックを探すコンポーネントの上）
export const BOOK_NEW = kit.defineCommand({
  id: "book-new",
  performs: [BOOK_CREATE.id],
  title: "New book",
  run: (_ctx, a) => a.openDialog(NEW_BOOK_DIALOG.id),
  when: ctx => ctx.book === NO_BOOK,
})
