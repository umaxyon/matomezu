// 書庫から参照エントリを置く・消す: 書庫の画面のコマンドが行う（書庫の画面のコマンドは、ブックが対象のアクションを行えない）。置く・消す中身は、ブックが対象の
// reference-add・reference-remove と同じ（core/book.ts）。置けるか（指す先が描ける・同じ先を指す物がまだ無い）は referable で確かめる（土台の perform も、新しく置いた物が描けるかを確かめ直す）
import { z } from "zod"
import { addReference, findReference, lineupOf, removeReference } from "../../../core/book"
import { CREATES_NOTHING, type LibraryTargets } from "../../../core/def/action"
import { bookOf, withBook } from "../../../core/folders-books"
import { referable } from "../../../core/references"
import { kit } from "../kit"

// 置いたブック book だけを、ブック自身として変える（許可スコープの "book" と同じ所）
const bookItself = (args: { book: string }): LibraryTargets => ({
  books: [{ book: args.book, where: {} }],
  creates: CREATES_NOTHING,
})

export const LIBRARY_REFERENCE_ADD = kit.defineAction({
  id: "library-reference-add",
  aiDescription:
    "The same as reference-add, done from the library: book is the book to put the reference in. Returns the reference's id as reference. Refused for what reference-add refuses, and for a book in the trash.",
  title: "Add reference",
  target: "library",
  args: z.strictObject({
    book: z.string().min(1),
    of: z.strictObject({ kind: z.enum(["page", "binder"]), id: z.string().min(1) }),
    index: z.number().int().min(0).optional(),
  }),
  permissionScope: bookItself,
  run: (library, args, ctx) => {
    const book = bookOf(library, args.book)
    if (!book || !referable(library, args.book, args.of)) return null
    if (args.index !== undefined && args.index > lineupOf(book).length) return null
    const done = addReference(book, args.of, ctx.newId, args.index)
    return { next: withBook(library, done.book), result: { reference: done.reference } }
  },
})

export const LIBRARY_REFERENCE_REMOVE = kit.defineAction({
  id: "library-reference-remove",
  aiDescription:
    "The same as reference-remove, done from the library: book is the book that has the reference. Returns nothing. Refused for a reference not in the book.",
  title: "Remove reference",
  target: "library",
  args: z.strictObject({ book: z.string().min(1), reference: z.string().min(1) }),
  permissionScope: bookItself,
  run: (library, args) => {
    const book = bookOf(library, args.book)
    if (!book || !findReference(book, args.reference)) return null
    return { next: withBook(library, removeReference(book, args.reference)), result: {} }
  },
})
