// 窓のスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す。ブックスクリーンのスロットは、定義の id がそのままスロットなので書き足さない）
import { kit } from "../kit"
import { BOOK_SCREEN_DEF } from "."

// ブックスクリーンを描くウィジェットを置くスロット（ステージの列を並べるウィジェット workspace を置く）。ブックスクリーンの定義の id そのもの
export const BOOK_SCREEN = BOOK_SCREEN_DEF.id
// カレントスクリーンがステージを並べないスクリーンの間の、下の行に並べるウィジェットを置くスロット（巣箱のボタンなど）。何も受け取らない
export const CONTROL_CENTER_FOOTER = kit.name("control-center-footer")
