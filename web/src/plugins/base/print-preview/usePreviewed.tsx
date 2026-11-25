// 描いている場所のステージの、印刷プレビューで開いているステージエントリ（previewed.ts）を引くフック

import { useMemo } from "react"
import { outsidePageIn } from "../../../core/folders-tree"
import { type ReferredPage, referredLineup } from "../../../core/references"
import { openedEntry } from "../../../core/stage"
import { NO_BOOK, NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import { useStageHere } from "../../../ui/scope"
import { useMatomezuState } from "../../../ui/store-context"
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

// 刷る物: previewed の並びの参照エントリを指す先の物に置き換えたステージエントリ（指す先が見えない物は飛ばす）と、置き換えたページの id → 持ち主と参照エントリ。
// 境目をまたぐ形の確かめは置き換える前の previewed で行う（指す先の形は、置いたブックからは直せない）
export const NOT_REFERRED: ReadonlyMap<string, ReferredPage> = new Map()
export function usePrinted(previewed: PreviewedEntry | null): {
  printed: PreviewedEntry | null
  referred: ReadonlyMap<string, ReferredPage>
} {
  const books = useMatomezuState(s => s.books)
  const pages = useMatomezuState(s => s.pages)
  const folders = useMatomezuState(s => s.folders)
  return useMemo(() => {
    if (!previewed?.lineup.some(e => e.kind === "reference")) return { printed: previewed, referred: NOT_REFERRED }
    const done = referredLineup({ books, pages, folders }, previewed.lineup)
    return { printed: { ...previewed, lineup: done.lineup }, referred: done.referred }
  }, [previewed, books, pages, folders])
}
