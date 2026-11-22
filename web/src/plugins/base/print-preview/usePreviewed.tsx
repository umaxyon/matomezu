// 描いている場所のステージの、印刷プレビューで開いているステージエントリ（previewed.ts）を引くフック
import { useMemo } from "react"
import { outsidePageIn } from "../../../core/folders-tree"
import { useStageHere } from "../../../ui/scope"
import { useBook, useOutsideBinder } from "../../../ui/view-hooks"
import { type PreviewedEntry, previewedOf } from "./previewed"

// 描いている場所のステージの、印刷プレビューで開いているステージエントリ（何も開いていなければ null）
export function usePreviewed(): PreviewedEntry | null {
  const book = useBook()
  const binder = useOutsideBinder()
  // 開いているのがブックの外のページ 1 枚なら、そのページ
  const page = useStageHere((st, s) => {
    const entry = st?.opened?.outermost
    return entry?.kind === "page" ? (outsidePageIn(s, entry.id) ?? null) : null
  })
  return useMemo(() => previewedOf(book, binder, page), [book, binder, page])
}
