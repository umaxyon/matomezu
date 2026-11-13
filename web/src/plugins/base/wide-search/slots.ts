// 横断検索のスロットの名前と、モードのビューに渡す物（base の ui.tsx で、core/catalog.ts の表に書き足す）
import { kit } from "../kit"

// 横断検索のモード（検索の入力の下にパネルを描く）を置くスロット。パネルは、置いたモードを並べて切り替える
export const WIDE_SEARCH_MODES = kit.name("wide-search-modes")
// 種類ごとの、横断検索の当たりの開き方を置くスロット
export const WIDE_SEARCH_OPENERS = kit.name("wide-search-openers")

// モードのビューに渡す物: 入力の文字と、入力の文字を変える関数
export interface WideSearchModeProps {
  term: string
  setTerm: (term: string) => void
}
