// ページを動かす: アクション page-move（ページタブの並びを入れ替える。ページの中身は変わらない）
import { z } from "zod"
import { pagesOf, putPage, removePage } from "../../../core/book"
import type { ItemPage } from "../../../core/placed"
import { kit } from "../kit"

const ARGS = z.strictObject({ page: z.string().min(1), index: z.number().int().min(0).optional() })

// ページ page を、page を除いて数えた index 番目に動かす（index が無ければ末尾）。無いページ・並びの外の index・今と同じ所は断る
export const PAGE_MOVE = kit.defineAction({
  id: "page-move",
  attach: { books: true },
  aiDescription:
    "Move a page to index among the pages counted without the moved page (the end without it), which reorders the page tabs. Returns nothing. Refused for a page not in the book, an index past the end, or when the page would stay where it is.",
  title: "Move page",
  target: "book",
  args: ARGS,
  permissionScope: "book",
  run: (book, args) => {
    const from = pagesOf(book).findIndex((p: ItemPage) => p.id === args.page)
    const page = pagesOf(book)[from]
    const to = args.index ?? pagesOf(book).length - 1
    if (!page || to > pagesOf(book).length - 1 || to === from) return null
    return { next: putPage(removePage(book, args.page), page, to), result: {} }
  },
})
