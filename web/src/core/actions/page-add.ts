// ページを足す: ページを持つブックの最後に、新しいページを足す
import { z } from "zod"
import { addPage, hasPages } from "../book"
import { defineAction } from "../def/action"

export const PAGE_ADD = defineAction({
  id: "page.add",
  title: "ページを足す",
  target: "book",
  needs: [],
  args: z.strictObject({}),
  run: (book, _args, ctx) => (hasPages(book) ? addPage(book, ctx.lang).book : book),
})
