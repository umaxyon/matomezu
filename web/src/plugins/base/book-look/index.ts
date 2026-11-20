// ブックを変える: ブックの設定のダイアログと、それを開くコマンド。アクション book-update（ブックの名前と、ブックが持つ設定の項目 settings。plugins/base/book-settings）と、
// アクション pages-update（ブックのページの設定の項目を、まとめて変える）。テーマと紙の色はページの設定の項目（look.ts）で、選んだタイプのページだけが持つ

import { z } from "zod"
import { findPage, pagesOf, putPage, withSettings } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Declined } from "../../../core/def/action"
import type { Book } from "../../../core/schema/book"
import { bookSettingsPatch, groupOf, type SettingGroup, settingsArgs, settleBook } from "../book-settings"
import { kit } from "../kit"
import { BOOK_LOCK, BOOK_UNLOCK } from "../lock"
import { pageProblems } from "../page-tabs/page-problems"
import { withPageSettings } from "./page-settings"

export { PAGE_PAPER_COLOR, PAGE_THEME, pageTheme, pageTokens } from "./look"
export { withPageSettings } from "./page-settings"
export { resolveTokens } from "./tokens"

const ARGS = z.strictObject({
  title: z.string().trim().min(1).optional(),
  settings: z.record(z.string(), z.unknown()).optional(), // ブックが持つ設定の項目（印刷プレビューの組を除く。形は機能台帳で決まるので AI には describeArgs で見せる）
})

// ブック book に、ブックが持つ設定の項目 settings（組 group の項目だけ。null は消す）を当てたブック（book-update と print-preview-update が使う）。
// 組に無い項目や形に合わない値があれば、どの項目かを添えて断る
export function withBookSettings(
  catalog: CoreCatalog,
  book: Book,
  settings: unknown,
  group: SettingGroup = "general",
): Book | Declined {
  const parsed = (bookSettingsPatch(catalog, group) ?? z.strictObject({})).safeParse(settings)
  if (parsed.success) return withSettings<Book>(book, parsed.data as Record<string, unknown>)
  const reasons = parsed.error.issues.map(issue =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map(key => `${key} is not a setting this action changes${elsewhere(catalog, key, group)}`).join("; ")
      : `${issue.path.map(String).join(".")}: ${issue.message}`,
  )
  return { declined: reasons.join("; ") }
}

// 項目 id が、組 group でないブックの設定の項目なら、どちらの組かの添え書き
function elsewhere(catalog: CoreCatalog, id: string, group: SettingGroup): string {
  const def = catalog.settings.get(id)
  if (def?.holder !== "outermost" || groupOf(def) === group) return ""
  return def.printPreview ? " (it is a print preview setting)" : " (it is not a print preview setting)"
}

// 渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。
// settings はブックが持つ設定の項目だけ（形に合わない・印刷プレビューの設定の項目（printPreview）なら、どの項目かを添えて断る。印刷プレビューの設定は print-preview-update が変える。null は消す）
export const BOOK_UPDATE = kit.defineAction({
  id: "book-update",
  attach: { books: true },
  aiDescription:
    "Change a book: title (not empty) and settings, the ones a book holds, keyed by the setting's id. Only what is given changes; null removes a setting (back to its default). The look of pages (theme, paper color and so on) belongs to each page: change it with page-update, or for many pages at once with pages-update. The print preview settings are changed by @matomezu/base:print-preview-update, not here (refused).",
  title: "Change book",
  target: "book",
  permissionScope: "book",
  args: ARGS,
  describeArgs: catalog => ARGS.extend({ settings: (bookSettingsPatch(catalog) ?? z.strictObject({})).optional() }),
  run: (book, args, ctx) => {
    const next: Book = args.title === undefined ? book : { ...book, title: args.title }
    if (args.settings === undefined) return { next, result: null }
    const settled = withBookSettings(ctx.catalog, next, args.settings)
    return "declined" in settled ? settled : { next: settled, result: null }
  },
})

const PAGES_ARGS = z.strictObject({
  pages: z.union([z.literal("all"), z.array(z.string().min(1)).min(1)]), // 変えるページ: ブックの全部（all）か、ページの id の並び
  settings: z.record(z.string(), z.unknown()), // ページの設定の項目（項目の id → 値。null は消す）
})

// ブックのページの設定の項目を、まとめて変える。変えるのは、認可ステップにもページのタイプにも止められず（ctx.permittedPages。ロックしたページは認可ステップが止める）、
// 渡した項目を全部持ち、値が合うタイプのページだけで、ほかのページ（項目を選んでいないタイプ・そのタイプで使えないテーマなど）は変えずに飛ばす。
// 変えたページは整え（settleBook）、変えたページに問題が出れば断る。1 枚も変えられなければ断る
export const PAGES_UPDATE = kit.defineAction({
  id: "pages-update",
  attach: { books: true },
  aiDescription:
    'Change the page settings of many pages of a book at once (such as @matomezu/base:page-theme and @matomezu/base:page-paper-color): pages is "all" or the ids of the pages, settings the values keyed by the setting\'s id (null removes one). A page is changed only when nothing stops this action on it (a page that a permission stops, such as a locked page, is left as it is), its page type has every given setting and takes the values (a theme must be one its page type lists); the other pages are left as they are. Returns updated (the ids of the pages changed) and skipped (the ids left as they were). Denied when a permission stops every page named; refused when no page can be changed, or for a page id not in the book.',
  title: "Change pages",
  target: "book",
  permissionScope: { pages: "pages", denied: "skip" },
  args: PAGES_ARGS,
  describeArgs: catalog => PAGES_ARGS.extend({ settings: settingsArgs(catalog) }),
  run: (book, args, ctx) => {
    if (args.pages !== "all" && args.pages.some(id => !findPage(book, id))) return null
    const targets = pagesOf(book).filter(p => args.pages === "all" || args.pages.includes(p.id))
    let next: Book = book
    const updated: string[] = []
    const skipped: string[] = []
    const permitted = new Set(ctx.permittedPages)
    for (const page of targets) {
      const changed = permitted.has(page.id) ? withPageSettings(ctx.catalog, page, args.settings) : null
      if (!changed) {
        skipped.push(page.id)
        continue
      }
      next = putPage(next, changed)
      updated.push(page.id)
    }
    if (updated.length === 0) return null
    const settled = settleBook(ctx.catalog, next)
    if (pageProblems(ctx.catalog, settled, updated).length > 0) return null
    return { next: settled, result: { updated, skipped } }
  },
})

export const BOOK_SETTINGS_DIALOG = kit.defineDialog({ id: "book-settings" })

// ブックの設定のダイアログを開く
export const BOOK_SETTINGS = kit.defineCommand({
  id: "book-settings",
  performs: [BOOK_UPDATE.id, PAGES_UPDATE.id, BOOK_LOCK.id, BOOK_UNLOCK.id],
  permissionScope: "book",
  title: "Book settings",
  run: (_ctx, a) => a.openDialog(BOOK_SETTINGS_DIALOG.id),
  when: () => true,
})
export { DIAGRAM_THEME_TYPE, DOCUMENT_THEME_TYPE, THEME_TYPES_CHECK, themeFits, themesFor } from "./theme-types"
