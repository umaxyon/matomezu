// ブックを作る: 何冊も作れるタイプの空のブックを、ブックの一覧に足す。登録表に無いタイプと、1 冊だけのタイプは断る
import { z } from "zod"
import { creatableTypes, createBook } from "../book"
import { defineAction } from "../def/action"

export const BOOK_CREATE = defineAction({
  id: "book.create",
  title: "新しいブック",
  target: "library",
  needs: [],
  args: z.strictObject({
    title: z.string().trim().min(1),
    type: z.string().min(1), // ブックのタイプの id
  }),
  run: (library, args, ctx) => {
    if (!creatableTypes(ctx.registry).includes(args.type)) return null
    const book = createBook(ctx.registry, args.type, { id: ctx.newId(), title: args.title })
    if (book.id in library) return null
    return { next: { ...library, [book.id]: book }, result: { book: book.id } }
  },
})
