// 描いている場所のステージで開いている物の、ページの全部（コマンドの文脈の openedPagesOf と同じ決まり）
import { useMemo } from "react"
import type { Page } from "../../../core/schema/book"
import { useBook, useOutsideBinder, usePage } from "../../../ui/view-hooks"
import { openedPagesFrom } from "./opened-page"

export function useOpenedPages(): readonly Page[] {
  const book = useBook()
  const binder = useOutsideBinder()
  const page = usePage()
  return useMemo(() => openedPagesFrom(book, binder, page), [book, binder, page])
}
