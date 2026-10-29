// ドロワーのスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す）。どれも、そのステージの id を渡す。
// 左から、地図（ミニマップと拡大縮小）・基本（ステージとブックの操作）・ブックの道具（ブックのタイプごとに替わる、置くアイテムなど）。並べる順はこの順
import { kit } from "../kit"

export const DRAWER_MAP = kit.name("drawer-map")
export const DRAWER_BASICS = kit.name("drawer-basics")
export const DRAWER_BOOK_TOOLS = kit.name("drawer-book-tools")
export const DRAWER_SLOTS = [DRAWER_MAP, DRAWER_BASICS, DRAWER_BOOK_TOOLS] as const
