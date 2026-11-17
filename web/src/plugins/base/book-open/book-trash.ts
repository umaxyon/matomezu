// ゴミ箱: ブックをゴミ箱に入れる book-trash（入っていたフォルダから外し、ゴミ箱の並びへ入れる）、戻す book-restore（元いたフォルダへ。
// 無ければ、その上のフォルダをたどる）、消す book-purge と、ゴミ箱を空にする trash-empty（書庫から消す。戻せない）。戻す・消す・空にするのは利用者だけ（userOnly）。
// 無いブック・入れ済みのブックは入れない。ロック中のブック・ロック中のページを持つブックは、認可ステップ lock が止める
import { z } from "zod"
import { isMoveRefusal, restoredEntry, restoreTargetOf, trashedEntry, trashRefOf } from "../../../core/entries"
import { bookOf, type Folders, type Library, libraryOf, TRASH_ID, withoutBook } from "../../../core/folders"
import type { Books } from "../../../core/library"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"

// ゴミ箱の直下のブックと、入れた時刻（新しい順）。trash はゴミ箱かその中のブック、folders は書庫のフォルダの行
export function trashOrder(trash: Books, folders: Folders): { book: Book; trashed: string }[] {
  const bin = folders[TRASH_ID]
  const refs = bin?.folderRole === "trash" ? bin.lineup : []
  return refs
    .flatMap(r => {
      const book = trash[r.id]
      return book ? [{ book, trashed: r.trashed }] : []
    })
    .sort((a, b) => (a.trashed < b.trashed ? 1 : -1))
}

// 書庫 library の、ゴミ箱の直下のブック id（ゴミ箱の直下に無ければ undefined）
const trashedBook = (library: Library, id: string): Book | undefined =>
  trashRefOf(library.folders, id)?.kind === "book" ? bookOf(library, id) : undefined

// ゴミ箱の直下のブック ids を書庫から消す（ゴミ箱の直下に無いブックは残す）
function purge(library: Library, ids: readonly string[]): Library {
  return ids.reduce((l, id) => (trashedBook(l, id) ? withoutBook(l, id) : l), library)
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
    if (!bookOf(library, args.book)) return null
    const next = trashedEntry(library, args.book, ctx.now)
    return isMoveRefusal(next) ? null : { next, result: {} }
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
    const from = trashedBook(library, args.book) ? trashRefOf(library.folders, args.book)?.from : undefined
    if (!from) return null
    const next = restoredEntry(library, args.book, restoreTargetOf(library.folders, from))
    return isMoveRefusal(next) ? null : { next, result: {} }
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
    if (!args.books.every(id => trashedBook(library, id))) return null
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
