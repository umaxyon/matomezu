// ページを足す: ページを持つブックの最後に、名前と紙を決めたページを足す。紙と向きはブックのタイプの規定（paperChoices）の中から選ぶ
import { z } from "zod"
import { addPage, canChoose, defaultPaper, hasPages, paperChoices } from "../../../core/book"
import { defineAction } from "../../../core/def/action"
import { ORIENTATIONS } from "../../../core/def/paper"

export const PAGE_ADD = defineAction({
  id: "page.add",
  title: "Add page",
  target: "book",
  needs: [],
  args: z.strictObject({
    title: z.string().trim().min(1),
    paper: z.string().min(1).optional(), // 紙の id。無ければ規定の既定
    orientation: z.enum(ORIENTATIONS).optional(), // 無ければ規定の既定
  }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const fallback = defaultPaper(ctx.catalog, book)
    const choice = { paper: args.paper ?? fallback.paper, orientation: args.orientation ?? fallback.orientation }
    if (!canChoose(paperChoices(ctx.catalog, book), choice)) return null
    const done = addPage(book, { title: args.title, ...choice }, ctx.newId)
    return { next: done.book, result: { page: done.page.id } }
  },
})
