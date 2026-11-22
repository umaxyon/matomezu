// 書庫からページ・バインダを写す・ブックにページを作る: entry-duplicate は、ページ・バインダ（ブックの中でも外でも）を、すぐ後ろに複製する（本体はページタブの page-duplicate・binder-duplicate と同じ）。
// page-create は、ブックにページを作る（本体はページタブの page-add と同じ。ブックの外には作らない）。どちらも書庫が対象。
// 本体が同じなので、ページのタイプが本体のアクションを外していれば（without）、これらもそのタイプで断る
import { z } from "zod"
import { findBinder, findPage } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ActionContext, Declined } from "../../../core/def/action"
import { freeTitle, titlesIn } from "../../../core/entries"
import type { Library, PageRow } from "../../../core/folders"
import { bookOf, withBinderEntry, withBook } from "../../../core/folders-books"
import { bookIdOf, outsideBinderIn, outsidePageIn } from "../../../core/folders-tree"
import { typeAllows } from "../../../core/inspect"
import type { BinderEntry, Book, LineupEntry } from "../../../core/schema/book"
import { kit } from "../kit"
import { BINDER_DUPLICATE, duplicatedBinder } from "../pages/binders"
import { describeNewPage, NEW_PAGE_ARGS, PAGE_ADD, withNewPage } from "../pages/page-add"
import { duplicatedPage, PAGE_DUPLICATE } from "../pages/page-duplicate"
import { placedInBook, placedOutsideBooks, placedOutsideTrash } from "./entries"

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

type Copied = { next: Library; result: { entry: string } } | Declined | null

// ブックの外のバインダ（id は binder）の中のページ entry を、そのバインダの中のすぐ後ろに複製した書庫
function copiedInOutsideBinder(library: Library, binder: string, entry: string, ctx: ActionContext): Copied {
  const was = outsideBinderIn(library, binder)
  if (!was || !typeLets(ctx.catalog, PAGE_DUPLICATE.id, was.pageType)) return null
  const done = duplicatedPage(ctx.catalog, { id: was.id, lineup: [was] }, entry, undefined, ctx.newId)
  if (!done || "declined" in done) return done
  const now = findBinder(done.book, was.id)
  return now ? { next: withBinderEntry(library, was, now), result: { entry: done.page } } : null
}

// 書庫ホームかフォルダの直下に在る、ブックの外のページ・バインダ entry を、同じフォルダのすぐ後ろに複製した書庫（バインダは中のページごと。名前は、そのフォルダのほかの物と重ならない番号付き）
function copiedOutsideBooks(library: Library, entry: string, ctx: ActionContext): Copied {
  const place = placedOutsideBooks(library.folders, entry)
  if (!place) return null
  const { holder, ref } = place
  const titled = (title: string) => freeTitle(title, titlesIn(library, holder, ctx.naming))
  const placed = (id: string): Library["folders"] => {
    const lineup = holder.lineup.flatMap(r => (r.id === entry ? [r, { ...ref, id }] : [r]))
    return { ...library.folders, [holder.id]: { ...holder, lineup } as typeof holder }
  }
  const page = outsidePageIn(library, entry)
  if (page) {
    if (!typeLets(ctx.catalog, PAGE_DUPLICATE.id, page.type)) return null
    const done = duplicatedPage(
      ctx.catalog,
      { id: holder.id, lineup: [page as LineupEntry] },
      entry,
      titled(page.title),
      ctx.newId,
    )
    if (!done || "declined" in done) return done
    const copy = findPage(done.book, done.page)?.page
    if (!copy) return null
    return {
      next: { pages: { ...library.pages, [copy.id]: copy as PageRow }, folders: placed(copy.id) },
      result: { entry: copy.id },
    }
  }
  const binder = outsideBinderIn(library, entry)
  const row = library.folders[entry]
  if (!binder || row?.folderRole !== "binder" || !typeLets(ctx.catalog, BINDER_DUPLICATE.id, binder.pageType))
    return null
  const lone = { id: holder.id, lineup: [binder] }
  const done = duplicatedBinder(ctx.catalog, lone, entry, titled(binder.title), ctx.newId)
  if (!done || "declined" in done) return done
  const copy: BinderEntry | undefined = findBinder(done.book, done.binder)
  if (!copy) return null
  const pages = { ...library.pages, ...Object.fromEntries(copy.lineup.map(p => [p.id, p])) }
  const made = {
    ...row,
    id: copy.id,
    title: copy.title,
    lineup: copy.lineup.map(p => ({ kind: "page" as const, id: p.id })),
  }
  return { next: { pages, folders: { ...placed(copy.id), [copy.id]: made } }, result: { entry: copy.id } }
}

export const ENTRY_DUPLICATE = kit.defineAction({
  id: "entry-duplicate",
  aiDescription:
    'Duplicate a page or a binder (with its pages), in a book or not: entry is its id. The copy goes right after it, in the same place (the same book, binder or folder), named after the original with a number (such as "Plan 2"). Everything in the copy gets new ids; the lock and notes or marks are not copied. Returns the copy\'s id as entry. Refused for a book, a folder, an entry in the trash, a page type whose pages cannot be duplicated or that leaves page-duplicate (binder-duplicate for a binder) out, or a binder holding a page that cannot be duplicated or read; refused (with a reason) for a page holding an item that cannot be copied.',
  title: "Duplicate",
  target: "library",
  permissionScope: { entry: "entry", where: "copy" },
  args: z.strictObject({ entry: z.string().min(1) }),
  run: (library, args, ctx) => {
    const book = bookHolding(library, args.entry)
    if (!book) {
      const holder = placedOutsideTrash(library.folders, args.entry)?.holder
      return holder?.folderRole === "binder"
        ? copiedInOutsideBinder(library, holder.id, args.entry, ctx)
        : copiedOutsideBooks(library, args.entry, ctx)
    }
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
