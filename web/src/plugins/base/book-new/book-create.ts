// ブックを作る: 名前だけを決めた、ページの無いブックを、書庫に足す（ブックはタイプを持たない。タイプはページが持つ）。
// 最初のページも一緒に作れる（page。page-add と同じ引数。1 回のアクションで、ブックとページを作る）。置くフォルダは into（言わなければ書庫ホーム）の末尾
import { z } from "zod"
import { isMoveRefusal, placedEntry } from "../../../core/entries"
import { withBook } from "../../../core/folders"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { holdsEntries } from "../library/entries"
import { describeNewPage, NEW_PAGE_ARGS, type NewPageResult, withNewPage } from "../pages/page-add"

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  into: z.string().min(1).optional(), // 置くフォルダ（書庫ホームかフォルダ。言わなければ書庫ホーム）
  page: NEW_PAGE_ARGS.optional(), // 最初のページ（page-add と同じ引数）
})

export const BOOK_CREATE = kit.defineAction({
  id: "book-create",
  aiDescription:
    "Create a book: title is its name, into the id of the folder to put it in (the library home without it; see read_folder), at the end. A book has no type and starts with no pages; page (the same arguments as page-add) makes its first page with it, in this one call. Returns the new book's id, and page: what page-add returns for the first page (when page is given). Refused when the first page cannot be made, and (title-taken) when that folder already has an entry with the same title.",
  title: "New book",
  target: "library",
  permissionScope: "create",
  args: ARGS,
  describeArgs: catalog => ARGS.extend({ page: describeNewPage(catalog).optional() }),
  run: (library, args, ctx) => {
    const empty: Book = { id: ctx.newId(), title: args.title, lineup: [] }
    if (empty.id in library.folders || empty.id in library.pages) return null
    const made = args.page === undefined ? null : withNewPage(ctx.catalog, empty, args.page, ctx)
    if (args.page !== undefined && !made) return null
    const result: { book: string; page?: NewPageResult } = { book: empty.id, ...(made ? { page: made.result } : {}) }
    const added = withBook(library, made?.book ?? empty)
    // 置くフォルダを言わなければ、置き場所は土台が決める（書庫ホームの末尾）
    if (args.into === undefined) return { next: added, result }
    if (!holdsEntries(library.folders, args.into)) return null
    const next = placedEntry(added, { kind: "book", id: empty.id }, args.into)
    return isMoveRefusal(next) ? null : { next, result }
  },
})
