// 窓のスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す。ブックスクリーンのスロットは、定義の id がそのままスロットなので書き足さない）
import { kit } from "../kit"
import { BOOK_SCREEN_DEF } from "."

// ブックスクリーンを描くウィジェットを置くスロット（ステージの列を並べるウィジェット workspace を置く）。ブックスクリーンの定義の id そのもの
export const BOOK_SCREEN = BOOK_SCREEN_DEF.id
// カレントスクリーンがステージを並べないスクリーンの間だけの、下の行（ブックスクリーンのフッタメニューとは別）に並べるウィジェットを置くスロット（置いた物が無ければ、下の行を描かない）。何も受け取らない
export const SCREEN_FOOTER = kit.name("screen-footer")
