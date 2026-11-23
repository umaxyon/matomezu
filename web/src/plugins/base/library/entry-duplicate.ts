// 書庫からページ・バインダを写す: entry-duplicate は、ページ・バインダ（ブックの中でも外でも）を、すぐ後ろに複製する（本体はページタブの page-duplicate・binder-duplicate と同じ）。
// 書庫が対象。本体が同じなので、ページのタイプが本体のアクションを外していれば（without）、これもそのタイプで断る
import { z } from "zod"
import { findBinder, findPage, foundPage } from "../../../core/book"
import type { ActionContext, Declined } from "../../../core/def/action"
import { freeTitle, isMoveRefusal, placedMade, titlesIn } from "../../../core/entries"
import type { Library } from "../../../core/folders"
import { bookOf, withBinderEntry, withBook } from "../../../core/folders-books"
import { bookIdOf, outsideBinderIn, outsidePageIn } from "../../../core/folders-tree"
import type { Book, LineupEntry } from "../../../core/schema/book"
import { kit } from "../kit"
import { BINDER_DUPLICATE, duplicatedBinder } from "../pages/binders"
import { duplicatedPage, PAGE_DUPLICATE } from "../pages/page-duplicate"
import { placedInBook, placedOutsideBooks, placedOutsideTrash, typeLets } from "./entries"

// ブックの中に在る（ゴミ箱の外の）エントリ entry を入れているブック（ブックの中に無ければ undefined）
function bookHolding(library: Library, entry: string): Book | undefined {
  if (!placedInBook(library.folders, entry)) return undefined
  const id = bookIdOf(library.folders, entry)
  return id === undefined ? undefined : bookOf(library, id)
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
  const { holder } = place
  const titled = (title: string) => freeTitle(title, titlesIn(library, holder, ctx.naming))
  // 写した物 copy を、元のすぐ後ろに置く
  const placed = (copy: LineupEntry | undefined): Copied => {
    if (!copy) return null
    const next = placedMade(library, copy, holder.id, holder.lineup.findIndex(r => r.id === entry) + 1)
    return isMoveRefusal(next) ? null : { next, result: { entry: copy.id } }
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
    return placed(foundPage(findPage(done.book, done.page)) as LineupEntry | undefined)
  }
  const binder = outsideBinderIn(library, entry)
  if (!binder || !typeLets(ctx.catalog, BINDER_DUPLICATE.id, binder.pageType)) return null
  const lone = { id: holder.id, lineup: [binder] }
  const done = duplicatedBinder(ctx.catalog, lone, entry, titled(binder.title), ctx.newId)
  if (!done || "declined" in done) return done
  return placed(findBinder(done.book, done.binder))
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
        : typeLets(ctx.catalog, PAGE_DUPLICATE.id, foundPage(findPage(book, args.entry))?.type)
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
