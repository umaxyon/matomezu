// 図面の設定のアクション: 図面のブックの設定と、ページの設定（どちらも線の既定の通り方）を変える
import { z } from "zod"
import { defineAction } from "../../../../core/def/action"
import { rectsOf } from "../items/items"
import { ROUTES, usesLines } from "../line"
import { elbowOf, tidyPage } from "../placed"

// ページの設定を変える。書いた項目だけを変え、null は消す（ブックの既定を継ぐ）。
// lineRoute はページの線の既定の通り方（線が自分の通り方を持たなければこれ。線が使えないブックでは断る）。直線になって引けなくなった手で直した区間は消す
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
    if (args.lineRoute !== undefined && !usesLines(ctx.registry, book)) return null
    const page = book.pages.find(p => p.id === args.page)
    if (!page) return null
    const { lineRoute: _, ...rest } = page
    const changed =
      args.lineRoute === undefined ? page : args.lineRoute === null ? rest : { ...page, lineRoute: args.lineRoute }
    const next = tidyPage(changed, rectsOf(ctx.registry, changed), elbowOf(book, changed))
    return { next: { ...book, pages: book.pages.map(p => (p.id === page.id ? next : p)) }, result: {} }
  },
})

// 図面のブックの設定を変える。書いた項目だけを変え、null は消す（既定に戻す）。
// lineRoute はブックの線の既定の通り方（ページが自分の既定を持たなければこれ。無ければ折れ線。線が使えないブックでは断る）。直線になって引けなくなった手で直した区間は、どのページでも消す
export const DRAWING_UPDATE = defineAction({
  id: "drawing.update",
  title: "Update drawing",
  target: "book",
  needs: [],
  args: z.strictObject({
    lineRoute: z.enum(ROUTES).nullable().optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    if (args.lineRoute !== undefined && !usesLines(ctx.registry, book)) return null
    const { lineRoute: _, ...rest } = book
    const changed: typeof book =
      args.lineRoute === undefined ? book : args.lineRoute === null ? rest : { ...book, lineRoute: args.lineRoute }
    const pages = changed.pages.map(p => tidyPage(p, rectsOf(ctx.registry, p), elbowOf(changed, p)))
    return { next: { ...changed, pages }, result: {} }
  },
})
