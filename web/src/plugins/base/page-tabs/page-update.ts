// ページを変える: アクション page.update（ブックのタイプが選んだページの設定の項目。core/book-settings.ts）
import { z } from "zod"
import { hasPages } from "../../../core/book"
import { settingsArgs, settingsPatchOf, settleBook, withSettings } from "../../../core/book-settings"
import { defineAction } from "../../../core/def/action"
import type { Book } from "../../../core/schema/book"

const ARGS = z.strictObject({
  page: z.string().min(1),
  settings: z.record(z.string(), z.unknown()), // ブックのタイプが足す項目（形はタイプが決める）
})

// ページ page の、書いた項目だけを変える（null は消す）。ブックのタイプが選んだ項目だけ（形に合わない・選んでいないタイプ・無いページなら断る）。
// 変えたらページを整える（settleBook）
export const PAGE_UPDATE = defineAction({
  id: "page.update",
  title: "Update page",
  target: "book",
  needs: [],
  args: ARGS,
  describeArgs: catalog => ARGS.extend({ settings: settingsArgs(catalog, "page") }),
  run: (book, args, ctx) => {
    if (!hasPages(book) || !book.pages.some(p => p.id === args.page)) return null
    const patch = settingsPatchOf(ctx.catalog, book, "page")?.safeParse(args.settings)
    if (!patch?.success) return null
    const pages = book.pages.map(p => (p.id === args.page ? withSettings(p, patch.data as Record<string, unknown>) : p))
    return { next: settleBook(ctx.catalog, { ...book, pages } as Book), result: {} }
  },
})
