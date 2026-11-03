// フッタメニューのスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す）。どれも、そのステージの id を渡す。
// 左から、地図（ミニマップと拡大縮小）・履歴（元に戻す・やり直す）・基本（ステージとブックの操作）・ブックの道具（ブックのタイプごとに替わる、置くアイテムなど）。並べる順はこの順
import { kit } from "../kit"

export const FOOTER_MENU_MAP = kit.name("footer-menu-map")
export const FOOTER_MENU_HISTORY = kit.name("footer-menu-history")
export const FOOTER_MENU_BASICS = kit.name("footer-menu-basics")
export const FOOTER_MENU_BOOK_TOOLS = kit.name("footer-menu-book-tools")
export const FOOTER_MENU_SLOTS = [
  FOOTER_MENU_MAP,
  FOOTER_MENU_HISTORY,
  FOOTER_MENU_BASICS,
  FOOTER_MENU_BOOK_TOOLS,
] as const
