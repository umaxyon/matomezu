// ページの設定のアクション: 図面のページの設定（線の既定の通り方）を変える
import { z } from "zod"
import { defineAction } from "../../../../core/def/action"
import { rectsOf } from "../items/items"
import { ROUTES } from "../line"
import { tidyPage } from "../placed"

// ページの設定を変える。書いた項目だけを変え、null は消す（既定に戻す）。
// lineRoute はページの線の既定の通り方（線が自分の通り方を持たなければこれ）。直線になって引けなくなった手で直した区間は消す
export const PAGE_UPDATE = defineAction({
  id: "page.update",
  title: "Update page",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    lineRoute: z.enum(ROUTES).nullable().optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const page = book.pages.find(p => p.id === args.page)
    if (!page) return null
    const { lineRoute: _, ...rest } = page
    const changed =
      args.lineRoute === undefined ? page : args.lineRoute === null ? rest : { ...page, lineRoute: args.lineRoute }
    const next = tidyPage(changed, rectsOf(ctx.registry, changed))
    return { next: { ...book, pages: book.pages.map(p => (p.id === page.id ? next : p)) }, result: {} }
  },
})
