// ブックを変える: ブックの設定のダイアログと、それを開くコマンド。アクション book-update（ブックの名前と、ブックのタイプが選んだ設定の項目 settings。plugins/base/book-settings.ts）。
// テーマと紙の色も設定の項目（look.ts）で、選んだタイプのブックだけが持つ
import { z } from "zod"
import { withSettings } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { settingsArgs, settingsPatchOf, settleBook } from "../book-settings"
import { kit } from "../kit"
import { BOOK_LOCK, BOOK_UNLOCK } from "../lock"
import { pageProblems } from "../page-tabs/page-problems"
import { BOOK_PAPER_COLOR, BOOK_THEME } from "./look"

export { BOOK_PAPER_COLOR, BOOK_THEME, bookTheme, bookTokens } from "./look"

const ARGS = z.strictObject({
  title: z.string().trim().min(1).optional(),
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが選んだ項目（形はタイプが決める）
})

// ブック book に、ブックの設定の項目 settings（ブックのタイプが選んだ項目だけ。null は消す）を当てたブック。形に合わない・選んでいないタイプなら null。
// 表に無いテーマは断り、紙の色は小文字にそろえ、ページを整え（settleBook）、問題の出るページがあれば断る（book-update と book-create が使う）
export function withBookSettings(catalog: CoreCatalog, book: Book, settings: unknown): Book | null {
  const patch = settingsPatchOf(catalog, book, "book")?.safeParse(settings)
  if (!patch?.success) return null
  const values = { ...(patch.data as Record<string, unknown>) }
  const theme = values[BOOK_THEME.id]
  if (typeof theme === "string" && !catalog.themes.has(theme)) return null
  const paper = values[BOOK_PAPER_COLOR.id]
  if (typeof paper === "string") values[BOOK_PAPER_COLOR.id] = paper.toLowerCase()
  const settled = settleBook(catalog, withSettings<Book>(book, values))
  return pageProblems(catalog, settled).length > 0 ? null : settled
}

// 渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。
// settings はブックのタイプが選んだ項目だけ（形に合わない・選んでいないタイプなら断る。null は消す）。表に無いテーマは断り、紙の色は小文字にそろえる。変えたらページを整える（settleBook）
export const BOOK_UPDATE = kit.defineAction({
  id: "book-update",
  attach: { books: true },
  aiDescription:
    "Change a book: title (not empty) and settings, the ones its book type has, keyed by the setting's id (for a drawing, @matomezu/base:book-theme: one of the themes, the boxes without a theme of their own follow it; @matomezu/base:book-paper-color: #rrggbb, the paper's color; @matomezu/line:line-route: how lines run on pages without a route of their own, straight or elbow, elbow without it). Only what is given changes; null removes a setting (back to the book type's theme, the theme's paper color, or the setting's default).",
  title: "Change book",
  target: "book",
  args: ARGS,
  describeArgs: catalog => ARGS.extend({ settings: settingsArgs(catalog, "book").optional() }),
  run: (book, args, ctx) => {
    const next: Book = args.title === undefined ? book : { ...book, title: args.title }
    if (args.settings === undefined) return { next, result: null }
    const settled = withBookSettings(ctx.catalog, next, args.settings)
    return settled && { next: settled, result: null }
  },
})

export const BOOK_SETTINGS_DIALOG = kit.defineDialog({ id: "book-settings" })

// ブックの設定のダイアログを開く（ブックのタイプが book-update を使える、名前と見た目を変えられるブックだけ）
export const BOOK_SETTINGS = kit.defineCommand({
  id: "book-settings",
  performs: [BOOK_UPDATE.id, BOOK_LOCK.id, BOOK_UNLOCK.id],
  title: "Book settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, BOOK_SETTINGS_DIALOG.id),
  when: () => true,
})
