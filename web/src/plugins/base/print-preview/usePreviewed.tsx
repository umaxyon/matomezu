// 描いている場所のステージの、印刷プレビューで開いているステージエントリ（previewed.ts）を引くフック

import { useMemo } from "react"
import { outsidePageIn } from "../../../core/folders-tree"
import { openedEntry } from "../../../core/stage"
import { NO_BOOK, NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import { useStageHere } from "../../../ui/scope"
import { useBook, useOutsideBinder } from "../../../ui/view-hooks"
import { type PreviewedEntry, previewedOf } from "./previewed"

// 描いている場所のステージの、印刷プレビューで開いているステージエントリ（何も開いていなければ null）
export function usePreviewed(): PreviewedEntry | null {
  const shownBook = useBook()
  const shownBinder = useOutsideBinder()
  const book = shownBook === NO_BOOK ? null : shownBook
  const binder = shownBinder === NO_OUTSIDE_BINDER ? null : shownBinder
  // 開いているのがブックの外のページ 1 枚なら、そのページ
  const page = useStageHere((st, s) => {
    const entry = openedEntry(st?.opened)
    return entry?.kind === "page" ? (outsidePageIn(s, entry.id) ?? null) : null
  })
  return useMemo(() => previewedOf(book, binder, page), [book, binder, page])
}
