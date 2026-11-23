// ブックを窓に出すフック: 全画面で開く（full）と、上下に分けて開く（split。分けられない低い窓なら全画面）。
// 分けて開くときの入れ方は showBookSplit（keepHere: 分けた並びの中から開いたとき、起点を残してもう片方の段を替えるか）
import { useActions } from "../../../ui/view-hooks"
import { useScreenSplit } from "./useScreenSplit"

// 一緒に並べる段の数
const PAIR = 2

export interface BookShower {
  full(book: string, page?: string): void
  fullClosingRows(book: string, page?: string): void // 上下に分けた並びのブックスクリーンを閉じてから、全画面で開く
  split(book: string, page?: string): void
  tall: boolean // 分けて開けるか（窓の高さが足りるか）
}

export function useShowBook(keepHere = false): BookShower {
  const actions = useActions()
  const split = useScreenSplit()
  const full = (book: string, page?: string) => {
    actions.showBook(book, page)
  }
  return {
    full,
    fullClosingRows: (book, page) => {
      if (split.inSplit) split.closeBooks()
      full(book, page)
    },
    split: (book, page) => split.showBook(book, page, keepHere, PAIR),
    tall: split.tall,
  }
}
