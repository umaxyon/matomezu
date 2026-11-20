// 書庫からブックの中の物を写す・作る: entry-duplicate は、ブックの中のページ・バインダを、すぐ後ろに複製する（本体はページタブの page-duplicate・binder-duplicate と同じ）。
// page-create は、ブックにページを作る（本体はページタブの page-add と同じ）。どちらも書庫が対象で、ブックの外のページ・バインダは扱わない。
// 本体が同じなので、ページのタイプが本体のアクションを外していれば（without）、これらもそのタイプで断る
import { z } from "zod"
import { findBinder, findPage } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Library } from "../../../core/folders"
import { bookOf, withBook } from "../../../core/folders-books"
import { bookIdOf } from "../../../core/folders-tree"
import { typeAllows } from "../../../core/inspect"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"
import { BINDER_DUPLICATE, duplicatedBinder } from "../pages/binders"
import { describeNewPage, NEW_PAGE_ARGS, PAGE_ADD, withNewPage } from "../pages/page-add"
import { duplicatedPage, PAGE_DUPLICATE } from "../pages/page-duplicate"
import { placedInBook, placedOutsideTrash } from "./entries"

// ブックの中に在る（ゴミ箱の外の）エントリ entry を入れているブック（ブックの中に無ければ undefined）
function bookHolding(library: Library, entry: string): Book | undefined {
  if (!placedInBook(library.folders, entry)) return undefined
  const id = bookIdOf(library.folders, entry)
  return id === undefined ? undefined : bookOf(library, id)
}

// ページのタイプ type が、ブックが対象のアクション action を使わせるか（タイプかアクションが機能台帳に無ければ使わせない）
function typeLets(catalog: CoreCatalog, action: string, type: string | undefined): boolean {
  const def = catalog.actions.get(action)
  const t = type === undefined ? undefined : catalog.pageTypes.get(type)
  return def !== undefined && t !== undefined && typeAllows(def, t)
}

export const ENTRY_DUPLICATE = kit.defineAction({
  id: "entry-duplicate",
  aiDescription:
    'Duplicate a page or a binder (with its pages) in a book: entry is its id. The copy goes right after it, in the same place, named after the original with a number (such as "Plan 2"). Everything in the copy gets new ids; the lock and notes or marks are not copied. Returns the copy\'s id as entry. Refused for a book, a folder, an entry in the trash, a page type whose pages cannot be duplicated or that leaves page-duplicate (binder-duplicate for a binder) out, or a binder holding a page that cannot be duplicated or read; refused (with a reason) for a page holding an item that cannot be copied.',
  title: "Duplicate",
  target: "library",
  permissionScope: { entry: "entry", where: "copy" },
  args: z.strictObject({ entry: z.string().min(1) }),
  run: (library, args, ctx) => {
    const book = bookHolding(library, args.entry)
    if (!book) return null
    const kind = library.folders[args.entry]?.folderRole === "binder" ? "binder" : "page"
    const allowed =
      kind === "binder"
        ? typeLets(ctx.catalog, BINDER_DUPLICATE.id, findBinder(book, args.entry)?.pageType)
        : typeLets(ctx.catalog, PAGE_DUPLICATE.id, findPage(book, args.entry)?.page.type)
    if (!allowed) return null
    const done =
      kind === "binder"
        ? duplicatedBinder(ctx.catalog, book, args.entry, undefined, ctx.newId)
        : duplicatedPage(ctx.catalog, book, args.entry, undefined, ctx.newId)
    if (!done || "declined" in done) return done
    return {
      next: withBook(library, done.book),
      result: { entry: "binder" in done ? done.binder : done.page },
    }
  },
})

const PAGE_CREATE_ARGS = NEW_PAGE_ARGS.extend({ folder: z.string().min(1) })

export const PAGE_CREATE = kit.defineAction({
  id: "page-create",
  aiDescription:
    "Create a page in a book of the library: folder is the id of the book (see read_folder). The other arguments are those of page-add. Returns what page-add returns. Refused for a folder that is not a book or is in the trash, for a page type that leaves page-add out, and as page-add refuses.",
  title: "New page",
  target: "library",
  // 作るページのタイプと入れるフォルダで問う（core が、ブックならそのブックに、ほかなら空のページで問う）
  permissionScope: (args: { folder: string; type: string }) => ({
    books: [],
    pages: [{ creates: args.type, into: args.folder }],
    creates: false,
  }),
  args: PAGE_CREATE_ARGS,
  describeArgs: catalog => describeNewPage(catalog).extend({ folder: z.string().min(1) }),
  run: (library, { folder, ...args }, ctx) => {
    const book = library.folders[folder]?.folderRole === "book" ? bookOf(library, folder) : undefined
    if (!book || placedOutsideTrash(library.folders, folder) === undefined) return null
    if (!typeLets(ctx.catalog, PAGE_ADD.id, args.type)) return null
    const done = withNewPage(ctx.catalog, book, args, ctx)
    return done && { next: withBook(library, done.book), result: done.result }
  },
})
