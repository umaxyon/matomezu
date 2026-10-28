// ページを足す: ページを持つブックの最後に、名前と紙を決めたページを足す。紙と向きはブックのタイプの規定（paperChoices）の中から選ぶ。
// タイプがページに足したフィールド（fields。page-fields.ts）と、ページの設定の項目（settings。plugins/base/book-settings.ts）も一緒に決められる
// （タイプのフィールドで要るものを渡さなければ、ブックのデータの形に合わず断られる）
import { z } from "zod"
import { addPage, canChoose, defaultPaper, hasPages, paperChoices, putPage, withSettings } from "../../../core/book"
import { ORIENTATIONS } from "../../../core/def/paper"
import { settingsArgs, settingsPatchOf, settleBook } from "../book-settings"
import { kit } from "../kit"
import { fieldsArgs, parseFields } from "./page-fields"

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  paper: z.string().min(1).optional(), // 紙の id。無ければ規定の既定
  orientation: z.enum(ORIENTATIONS).optional(), // 無ければ規定の既定
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが選んだページの設定の項目（形はタイプが決める）
  fields: z.record(z.string(), z.unknown()).optional(), // ブックのタイプがページに足したフィールド（形はタイプが決める）
})

export const PAGE_ADD = kit.defineAction({
  id: "page-add",
  attach: { pages: true },
  aiDescription:
    "Add a page at the end of a book. Paper and orientation default to the book type's. fields are the page's own fields its book type adds (required ones must be given), settings the page settings it has. Returns the new page's id.",
  title: "Add page",
  target: "book",
  args: ARGS,
  describeArgs: catalog =>
    ARGS.extend({ settings: settingsArgs(catalog, "page").optional(), fields: fieldsArgs(catalog).optional() }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const fallback = defaultPaper(ctx.catalog, book)
    const choice = { paper: args.paper ?? fallback.paper, orientation: args.orientation ?? fallback.orientation }
    if (!canChoose(paperChoices(ctx.catalog, book), choice)) return null
    const fields = parseFields(ctx.catalog, book, args.fields)
    const settings =
      args.settings === undefined ? null : settingsPatchOf(ctx.catalog, book, "page")?.safeParse(args.settings)
    if (!fields || settings === undefined || settings?.success === false) return null
    const done = addPage(book, { title: args.title, ...choice }, ctx.newId)
    const page = { ...done.page, ...fields }
    if (!settings) return { next: putPage(done.book, page), result: { page: done.page.id } }
    const next = putPage(done.book, withSettings(page, settings.data as Record<string, unknown>))
    return { next: settleBook(ctx.catalog, next), result: { page: done.page.id } }
  },
})
