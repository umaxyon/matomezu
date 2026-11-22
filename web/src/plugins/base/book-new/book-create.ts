// ブックを作る: 名前だけを決めた、ページの無いブックを、書庫に足す（ブックはタイプを持たない。タイプはページが持つ）。
// 最初のページも一緒に作れる（page。page-add と同じ引数。1 回のアクションで、ブックとページを作る）。置くフォルダは into（言わなければ、日付フォルダ。library/today-folder.ts）の、
// at が first なら先頭（書庫ホームではシステムフォルダの後）、last なら末尾（言わなければ先頭。新しい物が前に並ぶ。画面から作るときは last を渡して末尾に置く）
import { z } from "zod"
import { isMoveRefusal, placedEntry } from "../../../core/entries"
import { TOP_FOLDERS } from "../../../core/folders"
import { withBook } from "../../../core/folders-books"
import { pinnedCount } from "../../../core/folders-tree"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { holdsEntries } from "../library/entries"
import { withTodayFolder } from "../library/today-folder"
import { describeNewPage, NEW_PAGE_ARGS, type NewPageResult, withNewPage } from "../pages/page-add"

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  into: z.string().min(1).optional(), // 置くフォルダ（書庫ホームかフォルダ。言わなければ、日付フォルダ）
  page: NEW_PAGE_ARGS.optional(), // 最初のページ（page-add と同じ引数）
  at: z.enum(["first", "last"]).optional(), // フォルダの並びの先頭か末尾か（言わなければ先頭）
})

export const BOOK_CREATE = kit.defineAction({
  id: "book-create",
  aiDescription:
    "Create a book: title is its name, into the id of the folder to put it in (see read_folder; without it, the folder named today's date (YYYY-MM-DD) in the documents folder, made when missing), and at where in it: first (the default; in the library home, after its system folders) or last. A book has no type and starts with no pages; page (the same arguments as page-add) makes its first page with it, in this one call. Returns the new book's id, into (the id of the folder it was put in), and page: what page-add returns for the first page (when page is given). Refused when the first page cannot be made, and (title-taken) when that folder already has an entry with the same title.",
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
    // 日付フォルダの id は、ブックとページの id の後に、いつも引く（日付フォルダがもう在っても、振る id の順が変わらない）
    const placed =
      args.into === undefined ? withTodayFolder(library, ctx.today, ctx.newId()) : { library, folder: args.into }
    if (!placed) return null
    const into = placed.folder
    const result: { book: string; into: string; page?: NewPageResult } = {
      book: empty.id,
      into,
      ...(made ? { page: made.result } : {}),
    }
    const added = withBook(placed.library, made?.book ?? empty)
    if (!holdsEntries(added.folders, into)) return null
    // 書庫ホームの先頭は、先頭に並ぶシステムフォルダの後
    const first = into === TOP_FOLDERS.home.id ? pinnedCount(added.folders) : 0
    const next = placedEntry(added, { kind: "book", id: empty.id }, into, args.at === "last" ? undefined : first)
    return isMoveRefusal(next) ? null : { next, result }
  },
})
