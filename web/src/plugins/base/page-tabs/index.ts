// ページ: ページを作る・開くコマンドと、ページを作るダイアログ（作るものはダイアログで決める）。ページの設定のダイアログと、それを開くコマンド。
// ページを作るダイアログとページの設定のダイアログは、ページのタイプが自分のものにできる（dialogs。行うアクションは同じ page-add・page-update）

import { findFolder, findPage, siblingsOf } from "../../../core/book"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import { ANY_PAGE_TYPE } from "../../../core/def/action"
import { editingBackground, folderOf, openedPage } from "../../../core/stage"
import type { DialogTaking, PageSettingsArgs } from "../../../store/dialogs"
import { kit } from "../kit"
import { PAGE_LOCK, PAGE_UNLOCK } from "../lock"
import { FOLDER_DUPLICATE, FOLDER_REMOVE, FOLDER_UPDATE } from "./folders"
import { PAGE_ADD } from "./page-add"
import { PAGE_DUPLICATE } from "./page-duplicate"
import { PAGE_REMOVE } from "./page-remove"
import { PAGE_UPDATE } from "./page-update"

export { PAGE_ADD } from "./page-add"

declare module "../../../core/catalog" {
  interface PageTypeExtras {
    // ページを複製できるか（複製したページの中の id を振り直すだけで済むタイプだけが宣言する。無ければ複製できない）
    duplicatesPages?: boolean
  }
}

// ページを作るダイアログが受ける値: 作るページのタイプと、入れるフォルダ（まとまるタイプのページを、今あるフォルダに足すとき。無ければ新しいフォルダを作る）
export interface NewPageDialogArgs {
  type: string
  folder?: string
}

export const NEW_PAGE_DIALOG = kit.defineDialogWith<NewPageDialogArgs>()({ id: "page-new" })

// ページを消す前に確かめるダイアログ（ページ一覧の右クリックのメニューから開く）
export const PAGE_DELETE_DIALOG = kit.defineDialogWith<{ page: string }>()({
  id: "page-delete",
  edits: a => [a.page],
})

// フォルダの設定のダイアログ（名前・紙・向き・削除）と、フォルダを消す前に確かめるダイアログが受ける値: フォルダの id
export interface FolderSettingsArgs {
  folder: string
}

export const FOLDER_SETTINGS_DIALOG = kit.defineDialogWith<FolderSettingsArgs>()({
  id: "folder-settings",
  edits: a => [a.folder],
})

export const FOLDER_DELETE_DIALOG = kit.defineDialogWith<FolderSettingsArgs>()({
  id: "folder-delete",
  edits: a => [a.folder],
})

// ページタブのページの右クリックのメニュー
export const PAGE_CONTEXT = kit.name("page-context")
// ページタブのフォルダの右クリックのメニュー
export const FOLDER_CONTEXT = kit.name("folder-context")
// ページ一覧のページの右クリックのメニュー（ページタブのメニューに、ここにページを足すが加わる）
export const PAGE_LIST_CONTEXT = kit.name("page-list-context")
// ページタブの＋が開く、ページのタイプの一覧のメニュー
export const ADD_PAGE_MENU = kit.name("add-page-menu")

// ページの設定のダイアログ。開いたステージのブックの、ページ page の設定の項目を変える
export const PAGE_SETTINGS_DIALOG = kit.defineDialogWith<PageSettingsArgs>()({
  id: "page-settings",
  edits: a => [a.page],
})

// タイプ type のページを作るダイアログと、ページの設定のダイアログ（タイプが名指していなければ base のダイアログ）。
// 受ける値が合うことは definePlugin が型で、名指したダイアログがあることは台帳アセンブルが確かめる
export function pageDialog(catalog: CoreCatalog, type: string, of: "add"): DialogTaking<NewPageDialogArgs>
export function pageDialog(catalog: CoreCatalog, type: string, of: "settings"): DialogTaking<PageSettingsArgs>
export function pageDialog(catalog: CoreCatalog, type: string, of: "add" | "settings"): string {
  return pageType(catalog, type).dialogs?.[of] ?? (of === "add" ? NEW_PAGE_DIALOG.id : PAGE_SETTINGS_DIALOG.id)
}

// タイプ type のページを作るダイアログを開く（folder を書けば、そのフォルダに足す）
export const PAGE_NEW = kit.defineCommand({
  id: "page-new",
  performs: [PAGE_ADD.id],
  permissionScope: { creates: "type" },
  title: "New page",
  run: (ctx, a, args: NewPageDialogArgs) => {
    if (ctx.book && ctx.catalog.pageTypes.has(args.type)) a.openDialog(pageDialog(ctx.catalog, args.type, "add"), args)
  },
  when: ctx => ctx.book !== null,
})

export const PAGE_OPEN = kit.defineCommand({
  id: "page-open",
  title: "Open page",
  run: (_ctx, a, page: string) => a.openPage(page),
  when: ctx => ctx.book !== null,
  enabled: ctx => !editingBackground(ctx.stage), // 背景編集モードの間は、ページを替えない（ページタブとページ一覧はこれを見て止まる）
})

// 開いているブックのフォルダを開く（中の最初のページ。空ならフォルダ）
export const FOLDER_OPEN = kit.defineCommand({
  id: "folder-open",
  title: "Open folder",
  run: (_ctx, a, folder: string) => a.openFolder(folder),
  when: ctx => ctx.book !== null,
  enabled: ctx => !editingBackground(ctx.stage),
})

// 開いているページの設定のダイアログを開く（base のダイアログは、ページの設定の項目が無いタイプでも、名前・紙・ロック・削除を持つ）
export const PAGE_SETTINGS = kit.defineCommand({
  id: "page-settings",
  performs: [PAGE_UPDATE.id, PAGE_LOCK.id, PAGE_UNLOCK.id],
  permissionScope: "opened-page",
  title: "Page settings",
  run: (ctx, a) => {
    const page = openedPage(ctx.stage.opened)
    if (page && ctx.book) a.openDialog(pageDialog(ctx.catalog, page.type, "settings"), { page: page.page })
  },
  when: ctx => ctx.book !== null && openedPage(ctx.stage.opened) !== null,
})

// ページ page のすぐ後ろ（同じ入れ物の中）に、同じタイプの新しいページを足して開く（ダイアログ無し。名前と紙はタイプの既定）
export const PAGE_ADD_AFTER = kit.defineCommand({
  id: "page-add-after",
  performs: [PAGE_ADD.id],
  // 作るのは、ページ page と同じタイプのページ
  permissionScope: (ctx, args: { page: string } | undefined) => ({
    creates: (args && ctx.book && findPage(ctx.book, args.page)?.page.type) || ANY_PAGE_TYPE,
  }),
  title: "Add page here",
  run: (ctx, a, { page }: { page: string }) => {
    const { book } = ctx
    const at = book ? findPage(book, page) : undefined
    if (!book || !at) return
    const siblings = siblingsOf(book, page) ?? []
    const index = siblings.findIndex(e => e.id === page) + 1
    const done = a.perform(
      PAGE_ADD.id,
      { type: at.page.type, index, ...(at.folder ? { into: { folder: at.folder.id } } : {}) },
      { book: book.id },
    )
    if (done.ok) a.openPage(done.result.page)
  },
  when: ctx => ctx.book !== null,
})

// ページ page を複製して、できたページを開く
export const PAGE_DUPLICATE_COMMAND = kit.defineCommand({
  id: "page-duplicate",
  performs: [PAGE_DUPLICATE.id],
  title: "Duplicate",
  run: (ctx, a, { page }: { page: string }) => {
    if (!ctx.book) return
    const done = a.perform(PAGE_DUPLICATE.id, { page }, { book: ctx.book.id })
    if (done.ok) a.openPage(done.result.page)
  },
  // 画面では、ロックしたページの複製を押せなくする（アクションは、並びの要素として複製する）
  permissionScope: { page: "page" },
  when: ctx => ctx.book !== null,
})

// ページ page を消す前に確かめるダイアログを開く
export const PAGE_DELETE = kit.defineCommand({
  id: "page-delete",
  performs: [PAGE_REMOVE.id],
  title: "Delete page...",
  run: (_ctx, a, { page }: { page: string }) => a.openDialog(PAGE_DELETE_DIALOG.id, { page }),
  permissionScope: { page: "page" },
  when: ctx => ctx.book !== null,
})

// フォルダ folder の設定のダイアログを開く
export const FOLDER_SETTINGS = kit.defineCommand({
  id: "folder-settings",
  performs: [FOLDER_UPDATE.id, FOLDER_REMOVE.id],
  permissionScope: { entry: "folder" },
  title: "Settings...",
  run: (ctx, a, { folder }: FolderSettingsArgs) => {
    if (ctx.book && findFolder(ctx.book, folder)) a.openDialog(FOLDER_SETTINGS_DIALOG.id, { folder })
  },
  when: ctx => ctx.book !== null,
})

// 開いているフォルダ（開いているページが入っているフォルダか、開いている空のフォルダ）の設定のダイアログを開く（フッタメニューの歯車。フォルダの外のページを開いていれば出さない）
export const FOLDER_SETTINGS_OPENED = kit.defineCommand({
  id: "folder-settings-opened",
  performs: [FOLDER_UPDATE.id, FOLDER_REMOVE.id],
  permissionScope: ctx => {
    const folder = ctx.book ? folderOf(ctx.book, ctx.stage.opened) : null
    return folder ? { entries: [folder] } : {}
  },
  title: "Settings",
  run: (ctx, a) => {
    const folder = ctx.book ? folderOf(ctx.book, ctx.stage.opened) : null
    if (folder) a.openDialog(FOLDER_SETTINGS_DIALOG.id, { folder })
  },
  when: ctx => ctx.book !== null && folderOf(ctx.book, ctx.stage.opened) !== null,
})

// フォルダ folder を中のページごと複製して、できたフォルダを開く
export const FOLDER_DUPLICATE_COMMAND = kit.defineCommand({
  id: "folder-duplicate",
  performs: [FOLDER_DUPLICATE.id],
  permissionScope: { entry: "folder" },
  title: "Duplicate",
  run: (ctx, a, { folder }: FolderSettingsArgs) => {
    if (!ctx.book) return
    const done = a.perform(FOLDER_DUPLICATE.id, { folder }, { book: ctx.book.id })
    if (done.ok) a.openFolder(done.result.folder)
  },
  when: ctx => ctx.book !== null,
})

// フォルダ folder を消す前に確かめるダイアログを開く
export const FOLDER_DELETE = kit.defineCommand({
  id: "folder-delete",
  performs: [FOLDER_REMOVE.id],
  permissionScope: { entry: "folder" },
  title: "Delete...",
  run: (_ctx, a, { folder }: FolderSettingsArgs) => a.openDialog(FOLDER_DELETE_DIALOG.id, { folder }),
  when: ctx => ctx.book !== null,
})
