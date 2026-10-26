// ページを変える: アクション page-update（ブックのタイプが選んだページの設定の項目。plugins/base/book-settings.ts）
import { z } from "zod"
import { hasPages, putPage } from "../../../core/book"
import { settingsArgs, settingsPatchOf, settleBook, withSettings } from "../book-settings"
import { kit } from "../kit"

const ARGS = z.strictObject({
  page: z.string().min(1),
  settings: z.record(z.string(), z.unknown()), // ブックのタイプが足す項目（形はタイプが決める）
})

// ページ page の、書いた項目だけを変える（null は消す）。ブックのタイプが選んだ項目だけ（形に合わない・選んでいないタイプ・無いページなら断る）。
// 変えたらページを整える（settleBook）
export const PAGE_UPDATE = kit.defineAction({
  id: "page-update",
  attach: { pages: true },
  aiDescription:
    "Change a page's settings, the ones its book type has (settings, keyed by the setting's id; for a drawing, @matomezu/line:line-route: how its lines run when they have no route of their own, straight or elbow). Only what is given changes; null removes it (a drawing page then follows its book's @matomezu/line:line-route).",
  title: "Update page",
  target: "book",
  args: ARGS,
  describeArgs: catalog => ARGS.extend({ settings: settingsArgs(catalog, "page") }),
  run: (book, args, ctx) => {
    const page = hasPages(book) ? book.pages.find(p => p.id === args.page) : undefined
    if (!hasPages(book) || !page) return null
    const patch = settingsPatchOf(ctx.catalog, book, "page")?.safeParse(args.settings)
    if (!patch?.success) return null
    return {
      next: settleBook(ctx.catalog, putPage(book, withSettings(page, patch.data as Record<string, unknown>))),
      result: {},
    }
  },
})
