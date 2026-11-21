// 描いている場所のステージで開いている物の、ページの全部（コマンドの文脈の openedPagesOf と同じ決まり）
import { useMemo } from "react"
import type { Page } from "../../../core/schema/book"
import { useBook, usePage } from "../../../ui/view-hooks"
import { pagesIn } from "./opened-page"

export function useOpenedPages(): readonly Page[] {
  const book = useBook()
  const page = usePage()
  return useMemo(() => pagesIn(book, page), [book, page])
}
