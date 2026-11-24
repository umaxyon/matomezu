// 書庫からブックやバインダの中の物を消す: entry-remove は、ブックの中のページ・バインダか、ブックの外のバインダの中のページを消す（本体はページタブの page-remove・binder-remove と同じ）。
// 書庫が対象なので、書庫の画面の履歴に入り、書庫で元に戻せる。ゴミ箱には入らない。書庫ホームかフォルダの直下の物は、ゴミ箱に入れる（entry-trash）
import { z } from "zod"
import { findBinder, findPage, NO_BINDER, NO_PAGE, removeBinder, removePage } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Library } from "../../../core/folders"
import { withBinderEntry, withBook } from "../../../core/folders-books"
import { outsideBinderIn } from "../../../core/folders-tree"
import { kit } from "../kit"
import { BINDER_REMOVE } from "../pages/binders"
import { PAGE_REMOVE } from "../pages/page-remove"
import { bookHolding, placedOutsideTrash, removesInside, typeLets } from "./entries"

// 書庫 library から entry を消した書庫（消す物（removesInside）でないか、ページのタイプが本体のアクションを外していれば null）
export function withoutEntry(catalog: CoreCatalog, library: Library, entry: string): Library | null {
  if (!removesInside(library.folders, entry)) return null
  const book = bookHolding(library, entry)
  if (book) {
    const binder = findBinder(book, entry)
    if (binder !== NO_BINDER)
      return typeLets(catalog, BINDER_REMOVE.id, binder.pageType) ? withBook(library, removeBinder(book, entry)) : null
    const page = findPage(book, entry)
    if (page === NO_PAGE || !typeLets(catalog, PAGE_REMOVE.id, page.page.type)) return null
    return withBook(library, removePage(book, entry))
  }
  const holder = placedOutsideTrash(library.folders, entry)?.holder
  const was = holder?.folderRole === "binder" ? outsideBinderIn(library, holder.id) : undefined
  if (!was || !typeLets(catalog, PAGE_REMOVE.id, was.pageType)) return null
  const now = findBinder(removePage({ id: was.id, lineup: [was] }, entry), was.id)
  return now === NO_BINDER ? null : withBinderEntry(library, was, now)
}

export const ENTRY_REMOVE = kit.defineAction({
  id: "entry-remove",
  aiDescription:
    "Remove a page or a binder (with its pages) that is in a book, or a page in a binder that is not in a book, with everything on it: entry is its id. It does not go to the trash; the user can undo it on the library screen. The last page of a book, or of a binder in a book, can be removed too (the binder stays, empty); the last page of a binder that is not in a book cannot (move the binder to the trash with entry-trash). For an entry directly in the library home or a folder, use entry-trash. Refused for a page type that leaves page-remove (binder-remove for a binder) out.",
  title: "Delete",
  target: "library",
  permissionScope: { entry: "entry", where: "all-pages" },
  args: z.strictObject({ entry: z.string().min(1) }),
  run: (library, args, ctx) => {
    const next = withoutEntry(ctx.catalog, library, args.entry)
    return next ? { next, result: {} } : null
  },
})
