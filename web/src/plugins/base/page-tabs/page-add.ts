// ページを足す: ページを持つブックの最後に、名前と紙を決めたページを足す。紙と向きはブックのタイプの規定（paperChoices）の中から選ぶ。
// タイプがページに足したフィールド（fields。page-fields.ts）と、ページの設定の項目（settings。plugins/base/book-settings.ts）も一緒に決められる
// （タイプのフィールドで要るものを渡さなければ、ブックのデータの形に合わず断られる）。フィールドの受け方が結果を返せば、結果の fields に入れて返す。
// 足したページにタイプが問題を知らせれば断る（page-problems.ts）
import { z } from "zod"
import { addPage, hasPages, putPage, withSettings } from "../../../core/book"
import { GROW_CHOICES, ORIENTATIONS } from "../../../core/def/paper"
import { settingsArgs, settingsPatchOf, settleBook } from "../book-settings"
import { kit } from "../kit"
import { fieldsArgs, writeFields } from "./page-fields"
import { pageProblems } from "./page-problems"
import { canChoose, defaultPaper, growsValue, paperChoices } from "./pages"

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  paper: z.string().min(1).optional(), // 紙の id。無ければ規定の既定
  orientation: z.enum(ORIENTATIONS).optional(), // 無ければ規定の既定
  grows: z.union([z.boolean(), z.enum(GROW_CHOICES)]).optional(), // 可変ページにするか、選んだ増やす向き（pages.ts の growsValue）。無ければ可変ページでない
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが選んだページの設定の項目（形はタイプが決める）
  fields: z.record(z.string(), z.unknown()).optional(), // ブックのタイプがページに足したフィールド（形はタイプが決める）
})

export const PAGE_ADD = kit.defineAction({
  id: "page-add",
  attach: { pages: true },
  aiDescription:
    'Add a page at the end of a book. Paper and orientation default to the book type\'s. With grows, the page grows by whole papers as its contents need, instead of keeping to one paper: the book type\'s grows in actions lists the ways a user picks from (right-down, right, down or all; true takes the first), or is "by-type" when the book type decides the ways itself (give true), "always" when every page always grows (give no grows), or "none" when its pages cannot grow. A page that grows left or up keeps one blank paper left of or above its contents: putting something there shifts all its contents right or down by whole papers (and an emptied first paper is closed up), so positions change; the result\'s notice says so. fields are the page\'s own fields its book type adds (required ones must be given), settings the page settings it has. Returns the new page\'s id, and in fields what the book type returns for its fields (such as the ids it gave).',
  title: "Add page",
  target: "book",
  permissionScope: "book",
  args: ARGS,
  describeArgs: catalog =>
    ARGS.extend({ settings: settingsArgs(catalog, "page").optional(), fields: fieldsArgs(catalog, "add").optional() }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const fallback = defaultPaper(ctx.catalog, book)
    const choice = { paper: args.paper ?? fallback.paper, orientation: args.orientation ?? fallback.orientation }
    if (!canChoose(paperChoices(ctx.catalog, book), choice)) return null
    const grows = growsValue(ctx.catalog, book, args.grows ?? false)
    if (grows === null) return null
    const settings =
      args.settings === undefined ? null : settingsPatchOf(ctx.catalog, book, "page")?.safeParse(args.settings)
    if (settings === undefined || settings?.success === false) return null
    const done = addPage(book, { title: args.title, ...choice, ...(grows === undefined ? {} : { grows }) }, ctx.newId)
    const written = writeFields(ctx.catalog, done.book, done.page, args.fields, "add", ctx.newId)
    if (!written) return null
    const result = { page: done.page.id, ...(written.result === undefined ? {} : { fields: written.result }) }
    const next = settings
      ? settleBook(
          ctx.catalog,
          putPage(done.book, withSettings(written.page, settings.data as Record<string, unknown>)),
        )
      : putPage(done.book, written.page)
    if (pageProblems(ctx.catalog, next, [done.page.id]).length > 0) return null
    return { next, result }
  },
})
