// ゴミ箱: ブックをゴミ箱に入れる book-trash（入れた時刻 trashed を付ける）、戻す book-restore（trashed を外す）、
// 消す book-purge と、ゴミ箱を空にする trash-empty（書庫から消す。戻せない）。戻す・消す・空にするのは利用者だけ（userOnly）。
// 無いブック・入れ済みのブックは入れない。ロック中のブック・ロック中のページを持つブックは、認可ステップ lock が止める
import { z } from "zod"
import { bookOf, type Library, libraryOf, withBook, withoutBook } from "../../../core/folders"
import type { Books } from "../../../core/library"
import type { Book } from "../../../core/schema/book"
import { setField } from "../fields"
import { kit } from "../kit"

// ゴミ箱に入れる物か: まだ入れていないブック（行えるかは、ほかに認可ステップなどが決める）
export const isTrashCandidate = (book: Book): boolean => book.trashed === undefined

// ゴミ箱のブックを、入れた時刻の新しい順に
export const trashOrder = (trash: Books): Book[] =>
  Object.values(trash).sort((a, b) => ((a.trashed ?? "") < (b.trashed ?? "") ? 1 : -1))

// ブック id の trashed を at にする（undefined なら外す）
function markTrashed(library: Library, id: string, at: string | undefined): Library {
  const book = bookOf(library, id)
  return book ? withBook(library, setField(book, ["title", "locked"], "trashed", at)) : library
}

// ゴミ箱のブック ids を書庫から消す（ゴミ箱に無いブックは残す）
function purge(library: Library, ids: readonly string[]): Library {
  return ids.reduce((l, id) => (bookOf(l, id)?.trashed === undefined ? l : withoutBook(l, id)), library)
}

export const BOOK_TRASH = kit.defineAction({
  id: "book-trash",
  aiDescription: `Move a book to the trash: it leaves the list of books (list_books no longer shows it); only the user can bring it back or delete it for good. Refused for a book that is locked or has a locked page (denied by ${kit.name("lock")}), and for a book shown on a screen now (open-on-screen: ask the user in the chat).`,
  title: "Move to trash",
  target: "library",
  // ブックごと動かすので、ページを含むブックの全部を変える（ロック中のページを持つブックも止める）
  permissionScope: { book: "book", where: "all-pages" },
  args: z.strictObject({ book: z.string().min(1) }),
  run: (library, args, ctx) => {
    const book = bookOf(library, args.book)
    if (!book || !isTrashCandidate(book)) return null
    return { next: markTrashed(library, args.book, ctx.now), result: {} }
  },
})

export const BOOK_RESTORE = kit.defineAction({
  id: "book-restore",
  aiDescription: "Bring a book back from the trash. Only the user can do this.",
  title: "Restore",
  target: "library",
  userOnly: true,
  permissionScope: { book: "book", where: "all-pages" },
  args: z.strictObject({ book: z.string().min(1) }),
  run: (library, args) => {
    if (bookOf(library, args.book)?.trashed === undefined) return null
    return { next: markTrashed(library, args.book, undefined), result: {} }
  },
})

export const BOOK_PURGE = kit.defineAction({
  id: "book-purge",
  aiDescription: "Delete books in the trash for good. Only the user can do this.",
  title: "Delete",
  target: "library",
  userOnly: true,
  permissionScope: { books: "books", where: "all-pages" },
  args: z.strictObject({ books: z.array(z.string().min(1)).min(1) }),
  run: (library, args) => {
    if (!args.books.every(id => bookOf(library, id)?.trashed !== undefined)) return null
    return { next: purge(library, args.books), result: {} }
  },
})

export const TRASH_EMPTY = kit.defineAction({
  id: "trash-empty",
  aiDescription: "Delete every book in the trash for good. Only the user can do this.",
  title: "Empty trash",
  target: "library",
  userOnly: true,
  permissionScope: "unknown", // どのブックを消すかは、行う前の引数からは言えない
  args: z.strictObject({}),
  run: library => ({ next: purge(library, Object.keys(libraryOf(library))), result: {} }),
})
