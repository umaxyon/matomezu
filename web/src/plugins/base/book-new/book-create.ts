// ブックを作る: 名前だけを決めた、ページの無いブックを、ブックの一覧に足す（ブックはタイプを持たない。タイプはページが持つ）。
// 最初のページも一緒に作れる（page。page-add と同じ引数。1 回のアクションで、ブックとページを作る）
import { z } from "zod"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { describeNewPage, NEW_PAGE_ARGS, type NewPageResult, withNewPage } from "../page-tabs/page-add"

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  page: NEW_PAGE_ARGS.optional(), // 最初のページ（page-add と同じ引数）
})

export const BOOK_CREATE = kit.defineAction({
  id: "book-create",
  aiDescription:
    "Create a book: title is its name. A book has no type and starts with no pages; page (the same arguments as page-add) makes its first page with it, in this one call. Returns the new book's id, and page: what page-add returns for the first page (when page is given). Refused when the first page cannot be made.",
  title: "New book",
  target: "library",
  permissionScope: "create",
  args: ARGS,
  describeArgs: catalog => ARGS.extend({ page: describeNewPage(catalog).optional() }),
  run: (library, args, ctx) => {
    const empty: Book = { id: ctx.newId(), title: args.title, lineup: [] }
    if (empty.id in library) return null
    const made = args.page === undefined ? null : withNewPage(ctx.catalog, empty, args.page, ctx)
    if (args.page !== undefined && !made) return null
    const result: { book: string; page?: NewPageResult } = { book: empty.id, ...(made ? { page: made.result } : {}) }
    return { next: { ...library, [empty.id]: made?.book ?? empty }, result }
  },
})
