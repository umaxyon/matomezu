// ページを動かす: アクション page-move（同じ入れ物の中で並びを入れ替える。ページの中身は変わらない）。
// 並びに直に入っているページはブックの並びの中、フォルダの中のページはそのフォルダの中で動く（入れ物をまたいでは動かさない）
import { z } from "zod"
import { findPage, lineupOf, moveEntry } from "../../../core/book"
import { kit } from "../kit"

const ARGS = z.strictObject({ page: z.string().min(1), index: z.number().int().min(0).optional() })

// ページ page を、同じ入れ物の中の、page を除いて数えた index 番目に動かす（index が無ければ末尾）。無いページ・並びの外の index・今と同じ所は断る
export const PAGE_MOVE = kit.defineAction({
  id: "page-move",
  attach: { books: true },
  aiDescription:
    "Move a page to index among the entries of the place it is in, counted without the moved page (the end without it): a page outside folders moves in the book's lineup (which reorders the page tabs; a folder counts as one entry), a page in a folder moves inside that folder. Returns nothing. Refused for a page not in the book, an index past the end, or when the page would stay where it is.",
  title: "Move page",
  target: "book",
  args: ARGS,
  permissionScope: "book",
  run: (book, args) => {
    const at = findPage(book, args.page)
    if (!at) return null
    const ids = (at.folder ? at.folder.lineup : lineupOf(book)).map(e => e.id)
    const from = ids.indexOf(args.page)
    const to = args.index ?? ids.length - 1
    if (to > ids.length - 1 || to === from) return null
    return { next: moveEntry(book, args.page, to), result: {} }
  },
})
