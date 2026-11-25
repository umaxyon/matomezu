// 参照エントリのアクション: ブックの並びに、ほかの所のページ（バインダの外の物）かバインダを見るだけで置く・消す。
// 指す先が書庫に在り、ゴミ箱に無く、このブックの中に無く、同じ先を指す参照エントリがこのブックに無いかは、土台が書庫を読んで確かめる（core/references.ts）
import { z } from "zod"
import { addReference, findReference, lineupOf, removeReference } from "../../../core/book"
import { kit } from "../kit"

export const REFERENCE_ADD = kit.defineAction({
  id: "reference-add",
  attach: { books: true },
  aiDescription:
    "Put a reference in the book's lineup: of is what it shows, a page (kind page: a page that is not in a binder) or a binder (kind binder), in another book or not in a book; index is the position in the lineup (the end without it). A reference only shows what it points to, as it is drawn there: nothing on it can be changed from this book (change it where it is: read_page with of.id). It has no title, settings or contents of its own. It stays while what it points to is in the library (shown as missing while that is in the trash); it goes by itself when that is deleted for good, moved into this book, or (a page) moved into a binder. Returns the reference's id as reference. Refused for something that is not in the library, is in the trash, cannot be read, is in this book or is kept in a backyard (such as a worker book), for a page in a binder (refer to the binder), for a book kept in a backyard, and for a second reference to the same thing.",
  title: "Add reference",
  target: "book",
  args: z.strictObject({
    of: z.strictObject({ kind: z.enum(["page", "binder"]), id: z.string().min(1) }),
    index: z.number().int().min(0).optional(),
  }),
  permissionScope: "book",
  run: (book, args, ctx) => {
    if (args.index !== undefined && args.index > lineupOf(book).length) return null
    const done = addReference(book, args.of, ctx.newId, args.index)
    return { next: done.book, result: { reference: done.reference } }
  },
})

export const REFERENCE_REMOVE = kit.defineAction({
  id: "reference-remove",
  attach: { books: true },
  aiDescription:
    "Remove a reference from the book's lineup: reference is its id. What it points to does not change. Returns nothing. Refused for a reference not in the book.",
  title: "Remove reference",
  target: "book",
  args: z.strictObject({ reference: z.string().min(1) }),
  permissionScope: "book",
  run: (book, args) => {
    if (!findReference(book, args.reference)) return null
    return { next: removeReference(book, args.reference), result: {} }
  },
})
