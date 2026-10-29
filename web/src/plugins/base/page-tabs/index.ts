// ページ: ページを作る・開くコマンドと、ページを作るダイアログ（作るものはダイアログで決める）。ページの設定のダイアログと、それを開くコマンド。
// ページを作るダイアログとページの設定のダイアログは、ブックのタイプが自分のものにできる（pages.dialogs。行うアクションは同じ page-add・page-update）

import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import type { DialogTaking, PageSettingsArgs } from "../../../store/dialogs"
import { settingDefs } from "../book-settings"
import { kit } from "../kit"
import { PAGE_LOCK, PAGE_UNLOCK } from "../lock"
import { PAGE_ADD } from "./page-add"
import { PAGE_UPDATE } from "./page-update"

export { PAGE_ADD } from "./page-add"

// ページタブの横に、ページを足すボタンを出すか（定義オブジェクトの拡張ポイントに書き足す。無ければ出さない。ページを持つタイプだけが使う）
declare module "../../../core/catalog" {
  interface BookTypeExtras {
    addPagesFromTabs?: boolean
  }
}

export const NEW_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

// ページの設定のダイアログ。開いたステージのブックの、ページ page の設定の項目を変える
export const PAGE_SETTINGS_DIALOG = kit.defineDialogWith<PageSettingsArgs>()({ id: "page-settings" })

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
// base のダイアログなら、ページの設定の項目を選んでいるタイプだけ）
export const PAGE_SETTINGS = kit.defineCommand({
  id: "page-settings",
  performs: [PAGE_UPDATE.id, PAGE_LOCK.id, PAGE_UNLOCK.id],
  permissionScope: "opened-page",
  title: "Page settings",
  run: (ctx, a) => {
    const page = ctx.stage.opened?.page
    if (page && ctx.book) a.openDialog(ctx.stage.id, pageDialog(ctx.catalog, ctx.book, "settings"), { page })
  },
  when: ctx =>
    ctx.book !== null &&
    ctx.stage.opened?.page != null &&
    (pageDialog(ctx.catalog, ctx.book, "settings") !== PAGE_SETTINGS_DIALOG.id ||
      settingDefs(ctx.catalog, ctx.book.type, "page").length > 0),
})
