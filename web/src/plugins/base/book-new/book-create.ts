// ブックを作る: 何冊も作れるタイプの空のブックを、ブックの一覧に足す。機能台帳に無いタイプと、1 冊だけのタイプは断る
import { z } from "zod"
import { creatableTypes, createBook } from "../../../core/book"
import type { BookTypeId, SingleBookTypeId } from "../../../core/catalog"
import { kit } from "../kit"

// 何冊も作れるブックのタイプの id（機能台帳の型の側から決まる。表に無いタイプは run が断る）
type ManyBookTypeId = Exclude<BookTypeId, SingleBookTypeId>

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  type: z.custom<ManyBookTypeId>(v => typeof v === "string" && v.length > 0),
})

export const BOOK_CREATE = kit.defineAction({
  id: "book-create",
  aiDescription:
    "Create a book. type is one of the book types that are creatable (bookTypes in actions). Returns the new book's id.",
  title: "New book",
  target: "library",
  needs: [],
  args: ARGS,
  // AI には、作れるタイプの id を選ぶ形で見せる
  describeArgs: catalog => {
    const [first, ...rest] = creatableTypes(catalog)
    return first ? ARGS.extend({ type: z.enum([first, ...rest]) }) : ARGS
  },
  run: (library, args, ctx) => {
    if (!creatableTypes(ctx.catalog).includes(args.type)) return null
    const book = createBook(ctx.catalog, args.type, { id: ctx.newId(), title: args.title })
    if (book.id in library) return null
    return { next: { ...library, [book.id]: book }, result: { book: book.id } }
  },
})
