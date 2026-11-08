// 窓のスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す）。どちらも何も受け取らない
import { kit } from "../kit"

// ブックスクリーンを置くスロット（ステージの列を並べるウィジェット workspace を置く）
export const BOOK_SCREEN = kit.name("book-screen")
// コントロールセンターの中身を置くスロット（下のフッターは窓が持つ）
export const CONTROL_CENTER_SCREEN = kit.name("control-center-screen")
