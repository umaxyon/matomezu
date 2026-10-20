// ブックを作る: 何冊も作れるタイプの空のブックを、ブックの一覧に足す
import { z } from "zod"
import { CREATABLE_TYPES, createBook } from "../book-types"
import { defineAction } from "../def/action"

export const BOOK_CREATE = defineAction({
  id: "book.create",
  title: "新しいブック",
  target: "library",
  needs: [],
  args: z.strictObject({
    title: z.string().trim().min(1),
    type: z.enum(CREATABLE_TYPES),
  }),
  run: (library, args, ctx) => {
    const book = createBook(args.type, { id: ctx.newId(), title: args.title })
    if (book.id in library) return null
    return { next: { ...library, [book.id]: book }, result: { book: book.id } }
  },
})
