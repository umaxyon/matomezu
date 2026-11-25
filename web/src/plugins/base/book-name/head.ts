// ブックの名前の枠の中、名前の前のスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す）。何も渡さない。
// 置くウィジェットは名前のボタンの中に描くので、押せる物を置かない（押すのは名前のボタンが受ける）
import { kit } from "../kit"

export const BOOK_NAME_HEAD = kit.name("book-name-head")
