// ブックを窓に出すフック: 全画面で開く（full）と、上下に分けて開く（split。分けられない低い窓なら全画面）。
// 分けて開くときの入れ方は bookSplitWay（keepHere: 分けた並びの中から開いたとき、起点を残してもう片方の段を替えるか）
import { useActions } from "../../../ui/view-hooks"
import { bookSplitWay } from "./split"
import { useScreenSplit } from "./useScreenSplit"

// 一緒に並べる段の数
const PAIR = 2

export interface BookShower {
  full(book: string, page?: string): void
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
    split: (book, page) => {
      if (!split.tall) return full(book, page)
      split.showBook(book, page, bookSplitWay(split.inSplit, split.index, keepHere), PAIR)
    },
    tall: split.tall,
  }
}
