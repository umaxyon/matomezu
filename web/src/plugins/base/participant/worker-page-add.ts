// ワーカーブックにページを足す: ワークルームのワーカーブック（workerBookOf が引く tickets-history の 1 冊）の最後に、ページを 1 枚足す。
// ブックがまだ無ければ、同じ書き込みで作る（名前はワーカーブックの名前、並びのエントリに workKey）。空のブックは作らない。
// どのワークルームかは、AI なら自分のワークルーム（workroom を省ける）、利用者なら workroom で渡す。書けるかは認可ステップ worker-book が決める
import { z } from "zod"
import { workroomOfActor } from "../../../core/actor"
import { backyardBookOf, placedInBackyard } from "../../../core/entries"
import { bookOf, withBook } from "../../../core/folders-books"
import { readerIn } from "../../../core/record-source"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { TICKETS_HISTORY } from "../library/backyards"
import { describeNewPage, NEW_PAGE_ARGS, type NewPageResult, withNewPage } from "../pages/page-add"
import { workerBookOf, workerBookReadsOf } from "./worker-book"

const PAGE_ARGS = NEW_PAGE_ARGS.omit({ index: true })
const ARGS = PAGE_ARGS.extend({ workroom: z.string().min(1).optional() })

export const WORKER_PAGE_ADD = kit.defineAction({
  id: "worker-page-add",
  aiDescription:
    "Add a page at the end of your worker book: the book of your workroom's current work (the ticket you are working on; your workroom's own book while you have none), which list_books and read_folder do not show. The same arguments as page-add (without index). The book is made with its first page when it does not exist yet. Returns the book's id and what page-add returns. Write down the page's id to find it again. Refused (worker-book) when workroom names another workroom.",
  title: "Add a page to the worker book",
  target: "library",
  permissionScope: "unknown",
  readsSubjects: workerBookReadsOf,
  args: ARGS,
  describeArgs: catalog => ARGS.extend(describeNewPage(catalog).omit({ index: true }).shape),
  run: (library, args, ctx) => {
    const { workroom, ...page } = args
    const room = workroom ?? workroomOfActor(ctx.actor)
    if (room === undefined) return null
    const { workKey, title } = workerBookOf(ctx.catalog, readerIn(ctx), room)
    const found = backyardBookOf(library, TICKETS_HISTORY.id, workKey)
    const book: Book | undefined = found ? bookOf(library, found) : { id: ctx.newId(), title, lineup: [] }
    if (!book || (!found && (book.id in library.folders || book.id in library.pages))) return null
    const made = withNewPage(ctx.catalog, book, page, ctx)
    if (!made) return null
    const added = withBook(library, made.book)
    const next = found ? added : placedInBackyard(added, book.id, TICKETS_HISTORY.id, workKey)
    if (typeof next === "string") return null
    const result: NewPageResult & { book: string } = { book: book.id, ...made.result }
    return { next, result }
  },
})
