// ゴミ箱: ブックをゴミ箱に入れる book-trash（入れた時刻 trashed を付ける）、戻す book-restore（trashed を外す）、
// 消す book-purge と、ゴミ箱を空にする trash-empty（一覧から消す。戻せない）。戻す・消す・空にするのは利用者だけ（userOnly）。
// 1 冊だけのタイプのブックと、無いブックは入れない。ロック中のブック・ロック中のページを持つブックは、許可の段 lock が止める
import { z } from "zod"
import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Library } from "../../../core/library"
import type { Book } from "../../../core/schema/book"
import { setField } from "../fields"
import { kit } from "../kit"

// ブックをゴミ箱に入れられるか: 1 冊だけのタイプでなく、ブックにもページにもロックが掛かっていない
export const trashable = (catalog: CoreCatalog, book: Book): boolean =>
  !bookType(catalog, book.type).single &&
  book.locked !== true &&
  !(hasPages(book) && book.pages.some(p => p.locked === true))

// ゴミ箱のブックを、入れた時刻の新しい順に
export const trashOrder = (trash: Library): Book[] =>
  Object.values(trash).sort((a, b) => ((a.trashed ?? "") < (b.trashed ?? "") ? 1 : -1))

// ブック id の trashed を at にする（undefined なら外す）
function markTrashed(library: Library, id: string, at: string | undefined): Library {
  const book = library[id]
  return book ? { ...library, [id]: setField(book, ["title", "locked"], "trashed", at) } : library
}

// ゴミ箱のブック ids を一覧から消す（ゴミ箱に無いブックは残す）
function purge(library: Library, ids: readonly string[]): Library {
  return Object.fromEntries(Object.entries(library).filter(([id, b]) => !(ids.includes(id) && b.trashed !== undefined)))
}

export const BOOK_TRASH = kit.defineAction({
  id: "book-trash",
  aiDescription: `Move a book to the trash: it leaves the list of books (list_books no longer shows it); only the user can bring it back or delete it for good. Refused for a book type that has only one book, for a book that is locked or has a locked page (denied by ${kit.name("lock")}), and for a book shown on a screen now (open-on-screen: ask the user in the chat).`,
  title: "Move to trash",
  target: "library",
  args: z.strictObject({ book: z.string().min(1) }),
  run: (library, args, ctx) => {
    const book = library[args.book]
    if (!book || book.trashed !== undefined || bookType(ctx.catalog, book.type).single) return null
    return { next: markTrashed(library, args.book, ctx.now), result: {} }
  },
})

export const BOOK_RESTORE = kit.defineAction({
  id: "book-restore",
  aiDescription: "Bring a book back from the trash. Only the user can do this.",
  title: "Restore",
  target: "library",
  userOnly: true,
  args: z.strictObject({ book: z.string().min(1) }),
  run: (library, args) => {
    if (library[args.book]?.trashed === undefined) return null
    return { next: markTrashed(library, args.book, undefined), result: {} }
  },
})

export const BOOK_PURGE = kit.defineAction({
  id: "book-purge",
  aiDescription: "Delete books in the trash for good. Only the user can do this.",
  title: "Delete",
  target: "library",
  userOnly: true,
  args: z.strictObject({ books: z.array(z.string().min(1)).min(1) }),
  run: (library, args) => {
    if (!args.books.every(id => library[id]?.trashed !== undefined)) return null
    return { next: purge(library, args.books), result: {} }
  },
})

export const TRASH_EMPTY = kit.defineAction({
  id: "trash-empty",
  aiDescription: "Delete every book in the trash for good. Only the user can do this.",
  title: "Empty trash",
  target: "library",
  userOnly: true,
  args: z.strictObject({}),
  run: library => ({ next: purge(library, Object.keys(library)), result: {} }),
})
