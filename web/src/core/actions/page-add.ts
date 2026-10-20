// ページを足す: ページを持つブックの最後に、名前と紙を決めたページを足す。紙はブックのタイプの規定（paperChoices）の中から選ぶ
import { z } from "zod"
import { addPage, defaultPaper, hasPages, paperChoices } from "../book"
import { defineAction } from "../def/action"
import { PAPER_NAMES } from "../paper"

export const PAGE_ADD = defineAction({
  id: "page.add",
  title: "ページを足す",
  target: "book",
  needs: [],
  args: z.strictObject({
    title: z.string().trim().min(1),
    paper: z.enum(PAPER_NAMES).optional(), // 無ければ規定の既定
  }),
  run: (book, args) => {
    if (!hasPages(book)) return null
    const paper = args.paper ?? defaultPaper(book)
    if (!paperChoices(book).includes(paper)) return null
    const done = addPage(book, { title: args.title, paper })
    return { next: done.book, result: { page: done.page.id } }
  },
})
