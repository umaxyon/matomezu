// ページ: ページを作る・開くコマンドと、ページを作るダイアログ（作るものはダイアログで決める）。ページの設定のダイアログと、それを開くコマンド。
// ページを作るダイアログとページの設定のダイアログは、ページのタイプが自分のものにできる（dialogs。行うアクションは同じ page-add・page-update）

import { findBinder, findPage, findReference, NO_BINDER, NO_PAGE, siblingsOf } from "../../../core/book"
import type { MessageKey } from "../../../core/catalog"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import { ANY_PAGE_TYPE } from "../../../core/def/action"
import { entriesIn } from "../../../core/entries"
import { binderOf, editingBackground } from "../../../core/stage"
import { type CommandContext, NO_BOOK, NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import type { DialogTaking, NewPageDialogArgs, PageSettingsArgs } from "../../../store/dialogs"
import { kit } from "../kit"
import { PAGE_CREATE } from "../library/page-create"
import { PAGE_LOCK, PAGE_UNLOCK } from "../lock"
import {
  BINDER_DUPLICATE,
  BINDER_REMOVE,
  BINDER_UPDATE,
  PAGE_ADD,
  PAGE_DUPLICATE,
  PAGE_REMOVE,
  PAGE_UPDATE,
  REFERENCE_REMOVE,
  UNRENEWABLE_SHAPE,
} from "../pages"
import { hasOpenedPage } from "../utils/opened-page"
import { whenPerformed } from "../utils/performed"
import { refusalMessage } from "../utils/refusal"
import { lineupIn, NO_LINEUP, showsPageDelete } from "./opened-lineup"

declare module "../../../core/catalog" {
  interface PageTypeExtras {
    // ページを複製できるか（無ければ複製できない）。宣言できるのは、ページの中の物の id を指すフィールドが、つなぐものの端と、survivesRenewedIds: false の形の中だけのタイプ（その形のあるページは、複製を断る）
    duplicatesPages?: boolean
  }
}

export type { NewPageDialogArgs }

export const NEW_PAGE_DIALOG = kit.defineDialogWith<NewPageDialogArgs>()({ id: "page-new" })

// ページを消す前に確かめるダイアログ（ページ一覧の右クリックのメニューから開く）
export const PAGE_DELETE_DIALOG = kit.defineDialogWith<{ page: string }>()({
  id: "page-delete",
  edits: a => [a.page],
})

// バインダの設定のダイアログ（名前・紙・向き・削除）と、バインダを消す前に確かめるダイアログが受ける値: バインダの id
export interface BinderSettingsArgs {
  binder: string
}

export const BINDER_SETTINGS_DIALOG = kit.defineDialogWith<BinderSettingsArgs>()({
  id: "binder-settings",
  edits: a => [a.binder],
})

export const BINDER_DELETE_DIALOG = kit.defineDialogWith<BinderSettingsArgs>()({
  id: "binder-delete",
  edits: a => [a.binder],
})

// ページタブのページの右クリックのメニュー
export const PAGE_CONTEXT = kit.name("page-context")
// ページタブのバインダの右クリックのメニュー
export const BINDER_CONTEXT = kit.name("binder-context")
// ページタブの参照エントリの右クリックのメニュー
export const REFERENCE_CONTEXT = kit.name("reference-context")
// ページ一覧のページの右クリックのメニュー（ページタブのメニューに、ここにページを足すが加わる）
export const PAGE_LIST_CONTEXT = kit.name("page-list-context")
// ページタブの＋が開く、ページのタイプの一覧のメニュー
export const ADD_PAGE_MENU = kit.name("add-page-menu")

// ページの設定のダイアログ。開いたステージが開いている物の中の、ページ page の設定の項目を変える
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

// タイプ type のページを作るダイアログを開く（binder を書けば、そのバインダに足す）
export const PAGE_NEW = kit.defineCommand({
  id: "page-new",
  performs: [PAGE_ADD.id],
  permissionScope: { creates: "type" },
  title: "New page",
  run: (ctx, a, args: NewPageDialogArgs) => {
    if (ctx.book !== NO_BOOK && ctx.catalog.pageTypes.has(args.type))
      a.openDialog(pageDialog(ctx.catalog, args.type, "add"), args)
  },
  when: ctx => ctx.book !== NO_BOOK,
})

// タイプ type のページを、書庫のフォルダ folder（書庫ホーム・フォルダ・ブック・ブックの外のバインダ）に作るダイアログを開く
export const PAGE_NEW_IN_FOLDER = kit.defineScreenCommand({
  id: "page-new-in-folder",
  title: "New page",
  performs: [PAGE_CREATE.id], // 開いたダイアログが行う
  run: (ctx, a, args: { type: string; folder: string }) => {
    if (ctx.catalog.pageTypes.has(args.type)) a.openDialog(pageDialog(ctx.catalog, args.type, "add"), args)
  },
  performsWith: (_ctx, args) => [{ action: PAGE_CREATE.id, args }],
  when: () => true,
})

export const PAGE_OPEN = kit.defineCommand({
  id: "page-open",
  title: "Open page",
  run: (_ctx, a, page: string) => a.openPage(page),
  when: ctx => ctx.book !== NO_BOOK || ctx.outsideBinder !== NO_OUTSIDE_BINDER,
  enabled: ctx => !editingBackground(ctx.stage), // 背景編集モードの間は、ページを替えない（ページタブとページ一覧はこれを見て止まる）
})

// 開いているブックのバインダを開く（中の最初のページ。空ならバインダ）
export const BINDER_OPEN = kit.defineCommand({
  id: "binder-open",
  title: "Open binder",
  run: (_ctx, a, binder: string) => a.openBinder(binder),
  when: ctx => ctx.book !== NO_BOOK,
  enabled: ctx => !editingBackground(ctx.stage),
})

// 開いているブックの参照エントリ reference を開く（指す先がバインダなら、選んだページ chosen。無ければ最初のページ）
export const REFERENCE_OPEN = kit.defineCommand({
  id: "reference-open",
  title: "Open reference",
  run: (_ctx, a, { reference, chosen }: { reference: string; chosen?: string }) => a.openReference(reference, chosen),
  when: ctx => ctx.book !== NO_BOOK,
  enabled: ctx => !editingBackground(ctx.stage),
})

// 参照エントリ reference の指す先を、それが在る所で開く（ページならそのページ、バインダなら今見せているページか、最初のページ。開ける所に無ければ何もしない）
export const REFERENCE_SOURCE = kit.defineCommand({
  id: "reference-source",
  title: "Go to source",
  run: (ctx, a, { reference }: { reference: string }) => {
    const ref = ctx.book === NO_BOOK ? undefined : findReference(ctx.book, reference)
    if (!ref) return
    if (ref.of.kind === "page") return a.openPageById(ref.of.id)
    const binder = ctx.folders[ref.of.id]
    const ids = binder?.folderRole === "binder" ? entriesIn(ctx.folders, binder.id).map(p => p.id) : []
    const o = ctx.stage.opened
    const chosen = o !== "none" && o.kind === "reference" && o.reference === reference ? o.chosen : NO_PAGE
    const page = ids.includes(chosen) ? chosen : ids[0]
    if (page) a.openPageById(page)
  },
  when: ctx => ctx.book !== NO_BOOK,
})

// 参照エントリ reference をブックの並びから消す（ゴミ箱には入れない。指す先は変わらない。Ctrl+Z で戻せる）
export const REFERENCE_DELETE = kit.defineCommand({
  id: "reference-delete",
  performs: [REFERENCE_REMOVE.id],
  permissionScope: "book",
  title: "Delete",
  run: (ctx, a, { reference }: { reference: string }) => {
    if (ctx.book !== NO_BOOK) a.perform(REFERENCE_REMOVE.id, { reference }, { book: ctx.book.id })
  },
  when: ctx => ctx.book !== NO_BOOK,
})

// 開いているページ（ブックの外のページでも）の設定のダイアログを開く（base のダイアログは、ページの設定の項目が無いタイプでも、名前・紙・ロック・削除を持つ）
export const PAGE_SETTINGS = kit.defineCommand({
  id: "page-settings",
  performs: [PAGE_UPDATE.id, PAGE_LOCK.id, PAGE_UNLOCK.id],
  permissionScope: "opened-page",
  title: "Page settings",
  run: (ctx, a) => {
    if (hasOpenedPage(ctx)) a.openDialog(pageDialog(ctx.catalog, ctx.page.type, "settings"), { page: ctx.page.id })
  },
  when: hasOpenedPage,
})

// ページ page（ページ一覧で右クリックしたページなど）の設定のダイアログを開く
export const PAGE_SETTINGS_OF = kit.defineCommand({
  id: "page-settings-of",
  performs: [PAGE_UPDATE.id, PAGE_LOCK.id, PAGE_UNLOCK.id],
  permissionScope: { page: "page" },
  title: "Page settings",
  run: (ctx, a, { page }: { page: string }) => {
    const lineup = lineupIn(ctx)
    const found = lineup !== NO_LINEUP ? findPage(lineup, page) : NO_PAGE
    if (found !== NO_PAGE) a.openDialog(pageDialog(ctx.catalog, found.page.type, "settings"), { page })
  },
  when: ctx => lineupIn(ctx) !== NO_LINEUP,
})

// ページ page のすぐ後ろ（同じブックかバインダの中。ブックの外のバインダの中でも）に、同じタイプの新しいページを足して開く（ダイアログ無し。名前と紙はタイプの既定）
export const PAGE_ADD_AFTER = kit.defineCommand({
  id: "page-add-after",
  performs: [PAGE_ADD.id],
  // 作るのは、ページ page と同じタイプのページ
  permissionScope: (ctx, args: { page: string } | undefined) => {
    const lineup = lineupIn(ctx)
    const found = args && lineup !== NO_LINEUP ? findPage(lineup, args.page) : NO_PAGE
    return { creates: found !== NO_PAGE ? found.page.type : ANY_PAGE_TYPE }
  },
  title: "Add page here",
  run: (ctx, a, { page }: { page: string }) => {
    const book = lineupIn(ctx)
    if (book === NO_LINEUP) return
    const at = findPage(book, page)
    if (at === NO_PAGE) return
    const siblings = siblingsOf(book, page)
    const index = siblings.findIndex(e => e.id === page) + 1
    const done = a.perform(
      PAGE_ADD.id,
      { type: at.page.type, index, ...(at.binder !== NO_BINDER ? { into: { binder: at.binder.id } } : {}) },
      { book: book.id },
    )
    whenPerformed(done, made => a.openPage(made.page))
  },
  when: ctx => lineupIn(ctx) !== NO_LINEUP,
})

// 複製を断られたときに知らせる文（認可ステップが止めたなら、そのステップの名前）
function duplicateRefusal(
  catalog: CoreCatalog,
  done: { reason: string; permission?: string; kind?: string },
): MessageKey {
  if (done.kind === UNRENEWABLE_SHAPE) return kit.message("Has a shape that cannot be copied")
  return refusalMessage(catalog, done, kit.message("Cannot be duplicated"))
}

// ページ page を複製して、できたページを開く（断られたらトーストで知らせる）
export const PAGE_DUPLICATE_COMMAND = kit.defineCommand({
  id: "page-duplicate",
  performs: [PAGE_DUPLICATE.id],
  title: "Duplicate",
  run: (ctx, a, { page }: { page: string }) => {
    const lineup = lineupIn(ctx)
    if (lineup === NO_LINEUP) return
    const done = a.perform(PAGE_DUPLICATE.id, { page }, { book: lineup.id })
    if (done.ok) whenPerformed(done, made => a.openPage(made.page))
    else a.showToast({ kind: "warn", message: duplicateRefusal(ctx.catalog, done) })
  },
  // エントリとして複製する（ロックしたページも押せる。書庫の行の複製と同じ）
  permissionScope: { entry: "page" },
  when: ctx => lineupIn(ctx) !== NO_LINEUP,
})

// ページ page を消す前に確かめるダイアログを開く（ブックの外のバインダは空にならないので、その最後の 1 枚には出さない）
export const PAGE_DELETE = kit.defineCommand({
  id: "page-delete",
  performs: [PAGE_REMOVE.id],
  title: "Delete page...",
  run: (_ctx, a, { page }: { page: string }) => a.openDialog(PAGE_DELETE_DIALOG.id, { page }),
  permissionScope: { page: "page" },
  when: ctx => showsPageDelete(ctx.book, ctx.outsideBinder),
})

// バインダ binder の設定のダイアログを開く
export const BINDER_SETTINGS = kit.defineCommand({
  id: "binder-settings",
  performs: [BINDER_UPDATE.id, BINDER_REMOVE.id],
  permissionScope: { entry: "binder" },
  title: "Settings...",
  run: (ctx, a, { binder }: BinderSettingsArgs) => {
    if (ctx.book !== NO_BOOK && findBinder(ctx.book, binder) !== NO_BINDER)
      a.openDialog(BINDER_SETTINGS_DIALOG.id, { binder })
  },
  when: ctx => ctx.book !== NO_BOOK,
})

// 文脈 ctx のステージで開いているバインダの id（ブックの中の、開いているページが入っているバインダか開いている空のバインダ。ブックの外のバインダを開いていれば、そのバインダ。無ければ null）
function openedBinderIn(ctx: CommandContext): string | null {
  if (ctx.book !== NO_BOOK) {
    const binder = binderOf(ctx.book, ctx.stage.opened)
    return binder === NO_BINDER ? null : binder
  }
  return ctx.outsideBinder !== NO_OUTSIDE_BINDER ? ctx.outsideBinder.id : null
}

// 開いているバインダ（開いているページが入っているバインダか、開いている空のバインダ。ブックの外のバインダを開いていれば、そのバインダ）の設定のダイアログを開く（フッタメニューの歯車。バインダの外のページを開いていれば出さない）
export const BINDER_SETTINGS_OPENED = kit.defineCommand({
  id: "binder-settings-opened",
  performs: [BINDER_UPDATE.id, BINDER_REMOVE.id],
  permissionScope: ctx => {
    const binder = openedBinderIn(ctx)
    return binder ? { entries: [binder] } : {}
  },
  title: "Settings",
  run: (ctx, a) => {
    const binder = openedBinderIn(ctx)
    if (binder) a.openDialog(BINDER_SETTINGS_DIALOG.id, { binder })
  },
  when: ctx => openedBinderIn(ctx) !== null,
})

// バインダ binder を中のページごと複製して、できたバインダを開く
export const BINDER_DUPLICATE_COMMAND = kit.defineCommand({
  id: "binder-duplicate",
  performs: [BINDER_DUPLICATE.id],
  permissionScope: { entry: "binder" },
  title: "Duplicate",
  run: (ctx, a, { binder }: BinderSettingsArgs) => {
    if (ctx.book === NO_BOOK) return
    const done = a.perform(BINDER_DUPLICATE.id, { binder }, { book: ctx.book.id })
    if (done.ok) whenPerformed(done, made => a.openBinder(made.binder))
    else a.showToast({ kind: "warn", message: duplicateRefusal(ctx.catalog, done) })
  },
  when: ctx => ctx.book !== NO_BOOK,
})

// バインダ binder を消す前に確かめるダイアログを開く
export const BINDER_DELETE = kit.defineCommand({
  id: "binder-delete",
  performs: [BINDER_REMOVE.id],
  permissionScope: { entry: "binder" },
  title: "Delete...",
  run: (_ctx, a, { binder }: BinderSettingsArgs) => a.openDialog(BINDER_DELETE_DIALOG.id, { binder }),
  when: ctx => ctx.book !== NO_BOOK,
})
