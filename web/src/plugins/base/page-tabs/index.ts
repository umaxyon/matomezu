// ページ: ページを作る・開くコマンドと、ページを作るダイアログ（作るものはダイアログで決める）。ページの設定のダイアログと、それを開くコマンド。
// ページを作るダイアログとページの設定のダイアログは、ブックのタイプが自分のものにできる（pages.dialogs。行うアクションは同じ page-add・page-update）

import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Where } from "../../../core/def/action"
import type { Book } from "../../../core/schema/book"
import type { CommandContext } from "../../../store/commands/def"
import type { DialogTaking, PageSettingsArgs } from "../../../store/dialogs"
import { kit } from "../kit"
import { PAGE_LOCK, PAGE_UNLOCK } from "../lock"
import { PAGE_ADD } from "./page-add"
import { PAGE_DUPLICATE } from "./page-duplicate"
import { PAGE_REMOVE } from "./page-remove"
import { PAGE_UPDATE } from "./page-update"

export { PAGE_ADD } from "./page-add"

// ページタブの横に、ページを足すボタンを出すか（定義オブジェクトの拡張ポイントに書き足す。無ければ出さない。ページを持つタイプだけが使う）
declare module "../../../core/catalog" {
  interface BookTypeExtras {
    addPagesFromTabs?: boolean
    // ページ一覧（ステージの左に、ページのサムネイルを縦に並べる）を出すか。出すタイプはページタブを出さない（無ければ出さない。ページを持つタイプだけが使う）
    pageList?: boolean
    // ページを複製できるか（複製したページの中の id を振り直すだけで済むタイプだけが宣言する。無ければ複製できない）
    duplicatesPages?: boolean
  }
}

// 引数 { page } のコマンドの許可の範囲: 引数のページ（まだ引数が無ければブック）
const pageArgScope = (_ctx: CommandContext, args: unknown): Where =>
  typeof args === "object" && args !== null && "page" in args && typeof args.page === "string"
    ? { page: args.page }
    : {}

export const NEW_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

// ページを消す前に確かめるダイアログ（ページ一覧の右クリックのメニューから開く）
export const PAGE_DELETE_DIALOG = kit.defineDialogWith<{ page: string }>()({
  id: "page-delete",
  edits: a => [a.page],
})

// ページ一覧のページの右クリックのメニュー（受け取るのは右クリックしたページの id）
export const PAGE_CONTEXT = kit.name("page-context")

// ページの設定のダイアログ。開いたステージのブックの、ページ page の設定の項目を変える
export const PAGE_SETTINGS_DIALOG = kit.defineDialogWith<PageSettingsArgs>()({
  id: "page-settings",
  edits: a => [a.page],
})

// ブックのページを作るダイアログと、ページの設定のダイアログ（タイプが名指していなければ base のダイアログ）。
// 受ける値が合うことは definePlugin が型で、名指したダイアログがあることは組み立てが確かめる
export function pageDialog(catalog: CoreCatalog, book: Book, of: "add"): DialogTaking<undefined>
export function pageDialog(catalog: CoreCatalog, book: Book, of: "settings"): DialogTaking<PageSettingsArgs>
export function pageDialog(catalog: CoreCatalog, book: Book, of: "add" | "settings"): string {
  return (
    bookType(catalog, book.type).pages?.dialogs?.[of] ?? (of === "add" ? NEW_PAGE_DIALOG.id : PAGE_SETTINGS_DIALOG.id)
  )
}

export const PAGE_NEW = kit.defineCommand({
  id: "page-new",
  performs: [PAGE_ADD.id],
  permissionScope: "book",
  title: "New page",
  run: (ctx, a) => {
    if (ctx.book) a.openDialog(ctx.stage.id, pageDialog(ctx.catalog, ctx.book, "add"))
  },
  when: ctx => ctx.book !== null,
})

export const PAGE_OPEN = kit.defineCommand({
  id: "page-open",
  title: "Open page",
  run: (ctx, a, page: string) => a.openPage(ctx.stage.id, page),
  when: ctx => ctx.book !== null && hasPages(ctx.book),
})

// 開いているページの設定のダイアログを開く（ブックのタイプが page-update を使えるブックだけ。
// base のダイアログは、ページの設定の項目が無いタイプでも、名前・紙・ロック・削除を持つ）
export const PAGE_SETTINGS = kit.defineCommand({
  id: "page-settings",
  performs: [PAGE_UPDATE.id, PAGE_LOCK.id, PAGE_UNLOCK.id],
  permissionScope: "opened-page",
  title: "Page settings",
  run: (ctx, a) => {
    const page = ctx.stage.opened?.page
    if (page && ctx.book) a.openDialog(ctx.stage.id, pageDialog(ctx.catalog, ctx.book, "settings"), { page })
  },
  when: ctx => ctx.book !== null && ctx.stage.opened?.page != null,
})

// ページ page のすぐ後ろ（page が無ければ最後）に、新しいページを足して開く（ダイアログ無し。名前と紙はタイプの既定）
export const PAGE_ADD_AFTER = kit.defineCommand({
  id: "page-add-after",
  performs: [PAGE_ADD.id],
  permissionScope: "book",
  title: "Add page here",
  run: (ctx, a, { page }: { page?: string }) => {
    const { book } = ctx
    if (!book || !hasPages(book)) return
    const at = page === undefined ? book.pages.length - 1 : book.pages.findIndex(p => p.id === page)
    if (at < 0 && book.pages.length > 0) return
    const done = a.perform(PAGE_ADD.id, { index: at + 1 }, { book: book.id })
    if (done.ok) a.openPage(ctx.stage.id, done.result.page)
  },
  when: ctx => ctx.book !== null && hasPages(ctx.book),
})

// ページ page を複製して、できたページを開く
export const PAGE_DUPLICATE_COMMAND = kit.defineCommand({
  id: "page-duplicate",
  performs: [PAGE_DUPLICATE.id],
  title: "Duplicate",
  run: (ctx, a, { page }: { page: string }) => {
    if (!ctx.book) return
    const done = a.perform(PAGE_DUPLICATE.id, { page }, { book: ctx.book.id })
    if (done.ok) a.openPage(ctx.stage.id, done.result.page)
  },
  permissionScope: pageArgScope,
  when: ctx => ctx.book !== null && hasPages(ctx.book) && bookType(ctx.catalog, ctx.book.type).duplicatesPages === true,
})

// ページ page を消す前に確かめるダイアログを開く
export const PAGE_DELETE = kit.defineCommand({
  id: "page-delete",
  performs: [PAGE_REMOVE.id],
  title: "Delete page...",
  run: (ctx, a, { page }: { page: string }) => a.openDialog(ctx.stage.id, PAGE_DELETE_DIALOG.id, { page }),
  permissionScope: pageArgScope,
  when: ctx => ctx.book !== null && hasPages(ctx.book),
})
