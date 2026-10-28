// ページを変える: アクション page-update（ページの名前と、ブックのタイプが選んだページの設定の項目（plugins/base/book-settings.ts）と、タイプがページに足したフィールド（page-fields.ts））
import { z } from "zod"
import { hasPages, putPage, withSettings } from "../../../core/book"
import { settingsArgs, settingsPatchOf, settleBook } from "../book-settings"
import { kit } from "../kit"
import { fieldsArgs, writeFields } from "./page-fields"

const ARGS = z.strictObject({
  page: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが足す項目（形はタイプが決める）
  fields: z.record(z.string(), z.unknown()).optional(), // ブックのタイプがページに足したフィールド（形はタイプが決める）
})

// ページ page の、渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。
// settings はブックのタイプが選んだ項目だけ（null は消す。形に合わない・選んでいないタイプ・無いページなら断る）。設定を変えたらページを整える（settleBook）。
// fields はタイプがページに足したフィールドだけで、受け方はタイプが決められる（決めていなければ、書いたフィールドを丸ごと替える。形に合わない・フィールドの無いタイプなら断る）。
// 受け方が結果を返せば、結果の fields に入れて返す
export const PAGE_UPDATE = kit.defineAction({
  id: "page-update",
  attach: { pages: true },
  aiDescription:
    "Change a page: title (not empty), fields (the page's own fields its book type adds, each replaced whole unless its book type says otherwise; what the book type returns comes back in fields) and settings, the ones its book type has (keyed by the setting's id; for a drawing, @matomezu/line:line-route: how its lines run when they have no route of their own, straight or elbow). Only what is given changes; null removes a setting (a drawing page then follows its book's @matomezu/line:line-route).",
  title: "Update page",
  target: "book",
  args: ARGS,
  describeArgs: catalog =>
    ARGS.extend({
      settings: settingsArgs(catalog, "page").optional(),
      fields: fieldsArgs(catalog, "update").optional(),
    }),
  run: (book, args, ctx) => {
    const found = hasPages(book) ? book.pages.find(p => p.id === args.page) : undefined
    if (!hasPages(book) || !found) return null
    const written = writeFields(ctx.catalog, book, found, args.fields, "update", ctx.newId)
    if (!written) return null
    const page = { ...written.page, ...(args.title === undefined ? {} : { title: args.title }) }
    const result = written.result === undefined ? {} : { fields: written.result }
    if (args.settings === undefined) return { next: putPage(book, page), result }
    const patch = settingsPatchOf(ctx.catalog, book, "page")?.safeParse(args.settings)
    if (!patch?.success) return null
    return {
      next: settleBook(ctx.catalog, putPage(book, withSettings(page, patch.data as Record<string, unknown>))),
      result,
    }
  },
})
