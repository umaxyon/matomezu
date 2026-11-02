// ページを変える: アクション page-update（ページの名前と、紙・向き・可変ページか、ブックのタイプが選んだページの設定の項目（plugins/base/book-settings.ts）と、タイプがページに足したフィールド（page-fields.ts））
import { z } from "zod"
import { hasPages, type PagedBook, putPage, withSettings } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import { GROW_CHOICES, ORIENTATIONS } from "../../../core/def/paper"
import type { Page } from "../../../core/schema/book"
import { settingsArgs, settingsPatchOf, settleBook } from "../book-settings"
import { kit } from "../kit"
import { fieldsArgs, writeFields } from "./page-fields"
import { pageProblems } from "./page-problems"
import { canChoose, growsValue, paperChoicesFor, withGrows } from "./pages"

const ARGS = z.strictObject({
  page: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  paper: z.string().min(1).optional(), // 紙の id
  orientation: z.enum(ORIENTATIONS).optional(),
  grows: z.union([z.boolean(), z.enum(GROW_CHOICES)]).optional(), // 可変ページにするか、選んだ増やす向き（pages.ts の growsValue）
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが足す項目（形はタイプが決める）
  fields: z.record(z.string(), z.unknown()).optional(), // ブックのタイプがページに足したフィールド（形はタイプが決める）
})

// ページ page の、渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。
// 紙と向きはタイプの規定の中から選ぶ（1 冊の紙をそろえる規定では、ほかのページと同じものだけ）。可変ページはタイプが増やす向きの決め方を持つときだけで、向きはタイプが選べるものの中から。
// 形が紙からはみ出すなら、整えステップ（variable-pages.ts）が断る（可変ページの広さは、紙の大きさで区切った印刷区画を増やして決まる）。
// settings はブックのタイプが選んだ項目だけ（null は消す。形に合わない・選んでいないタイプ・無いページなら断る）。設定を変えたらページを整える（settleBook）。
// fields はタイプがページに足したフィールドだけで、受け方はタイプが決められる（決めていなければ、書いたフィールドを丸ごと替える。形に合わない・フィールドの無いタイプなら断る）。
// 受け方が結果を返せば、結果の fields に入れて返す。変えたページにタイプが問題を知らせれば断る（page-problems.ts）
export const PAGE_UPDATE = kit.defineAction({
  id: "page-update",
  attach: { pages: true },
  aiDescription:
    "Change a page: title (not empty), paper and orientation (among the book type's; refused if the page's shapes would not fit), grows (the ways to grow by whole papers or true, as in page-add; false keeps it to one paper; refused if the shapes would not fit), fields (the page's own fields its book type adds, each replaced whole unless its book type says otherwise; what the book type returns comes back in fields) and settings, the ones its book type has (keyed by the setting's id; for a drawing, @matomezu/line:line-route: how its lines run when they have no route of their own, straight or elbow). Only what is given changes; null removes a setting (a drawing page then follows its book's @matomezu/line:line-route).",
  title: "Update page",
  target: "book",
  args: ARGS,
  describeArgs: catalog =>
    ARGS.extend({
      settings: settingsArgs(catalog, "page").optional(),
      fields: fieldsArgs(catalog, "update").optional(),
    }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    const found = hasPages(book) ? book.pages.find(p => p.id === args.page) : undefined
    if (!hasPages(book) || !found) return null
    const written = writeFields(ctx.catalog, book, found, args.fields, "update", ctx.newId)
    if (!written) return null
    const papered = withPaper(ctx.catalog, book, written.page, args)
    if (!papered) return null
    const page = { ...papered, ...(args.title === undefined ? {} : { title: args.title }) }
    const result = written.result === undefined ? {} : { fields: written.result }
    const patch =
      args.settings === undefined ? null : settingsPatchOf(ctx.catalog, book, "page")?.safeParse(args.settings)
    if (patch === undefined || patch?.success === false) return null
    const next = patch
      ? settleBook(ctx.catalog, putPage(book, withSettings(page, patch.data as Record<string, unknown>)))
      : putPage(book, page)
    if (pageProblems(ctx.catalog, next, [found.id]).length > 0) return null
    return { next, result }
  },
})

// ページ page の紙・向き・可変ページかを args のとおりにしたもの（どれも渡さなければ page のまま）。選べない紙・向き・増やす向き、可変ページを作れないタイプなら null
function withPaper(catalog: CoreCatalog, book: PagedBook, page: Page, args: z.infer<typeof ARGS>): Page | null {
  if (args.paper === undefined && args.orientation === undefined && args.grows === undefined) return page
  const choice = { paper: args.paper ?? page.paper, orientation: args.orientation ?? page.orientation }
  if (!canChoose(paperChoicesFor(catalog, book, page.id), choice)) return null
  const grows = args.grows === undefined ? page.grows : growsValue(catalog, book, args.grows)
  if (grows === null) return null
  // 中身のずらしと、形が紙に入るかの確かめは、整えステップ（variable-pages.ts）がする
  return withGrows({ ...page, ...choice }, grows)
}
