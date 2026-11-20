// 書庫が対象のアクションの、行う前に問う相手と、行った後の確かめ（守らせること・整え・システムフォルダの決まり）

import type { LibraryPageRows } from "./changes"
import type { CoreCatalog } from "./core-catalog"
import type { ActionContext, ActionDef, EntryWhere, LibraryTargets, Where } from "./def/action"
import { binnedBetween, isWithin } from "./entries"
import {
  bookIdOf,
  inTrash,
  isKeptSystemFolder,
  isOpenRole,
  type Library,
  libraryOf,
  type PageRow,
  permissionFoldersOf,
  systemFolderOf,
} from "./folders"
import type { AskedPage } from "./inspect"
import { broken, brokenPage, normalizedPage, pageChecksBetween, placeChangeOf } from "./perform-checks"
import type { ItemPage } from "./placed"
import type { Book } from "./schema/book"

// 書庫が対象のアクションの、行う前に問う相手: ブック book とその中の所 where か、ページそのもの（ブックの外のページか作るページ。core/inspect.ts の AskedPage）
export type LibraryAsk = { book: Book; where: Where } | { page: AskedPage }
// エントリから出した問う相手（ブックは id）
type EntryAsk = { book: string; where: Where } | { page: AskedPage }

// 書庫 library のブックの外のページ id を、エントリの変え方 how で問う相手（表に無いページには問わない）
function outsidePageAsk(library: Library, id: string, how: EntryWhere): EntryAsk[] {
  const row = library.pages[id]
  if (!row) return []
  return [{ page: { page: row, folders: permissionFoldersOf(library.folders, id), where: { entry: how } } }]
}

// 書庫が対象のアクションが名指したエントリ entry を where のとおりに変えるとき、行う前に問う相手:
// ブックならそのブック、フォルダなら中のブックの全部と、中のブックの外のページの全部（名前だけ・複製だけなら、どれにも問わない）、ブックの中のページ・バインダなら、そのブックのそのエントリ
// （動かす・名前を変えるなら、その印 entriesChange を添える）、ブックの外のページならそのページ、ブックの外のバインダなら中のページの全部（名前だけ・複製だけなら問わない）。
// ブックの外のページには、エントリの変え方をそのまま where の entry に添える。into（動かす先のフォルダ）がほかのブックかその中なら、そのブックにも、入るエントリとして問う
function asksOfEntry(library: Library, entry: string, how: EntryWhere, into?: string): EntryAsk[] {
  const where: Where = how === "all-pages" ? { allPages: true } : how === "place" ? { place: true } : {}
  const row = library.folders[entry]
  const from = row?.folderRole === "book" ? entry : bookIdOf(library.folders, entry)
  const to =
    into === undefined
      ? undefined
      : library.folders[into]?.folderRole === "book"
        ? into
        : bookIdOf(library.folders, into)
  // 中身ごと変えるページは、そのページを丸ごと変える所で問う
  const whole = how === "all-pages" && library.pages[entry] !== undefined
  const asked = (book: string) => ({
    book,
    where: whole
      ? ({ page: entry } as Where)
      : ({ entries: [entry], ...(how === "place" || how === "title" ? { entriesChange: how } : {}) } as Where),
  })
  const enters = to !== undefined && to !== from && row?.folderRole !== "book" ? [asked(to)] : []
  if (row?.folderRole === "book") return how === "copy" ? [] : [{ book: entry, where }]
  if (row && isOpenRole(row.folderRole)) {
    if (how === "title" || how === "copy") return []
    const books = Object.values(library.folders).flatMap(f =>
      f.folderRole === "book" && isWithin(library.folders, f.id, entry) ? [{ book: f.id, where }] : [],
    )
    const pages = Object.keys(library.pages).flatMap(id =>
      bookIdOf(library.folders, id) === undefined && isWithin(library.folders, id, entry)
        ? outsidePageAsk(library, id, how)
        : [],
    )
    return [...books, ...pages]
  }
  if (from !== undefined) return [asked(from), ...enters]
  if (row?.folderRole === "binder")
    return how === "title" || how === "copy"
      ? enters
      : [...row.lineup.flatMap(p => outsidePageAsk(library, p.id, how)), ...enters]
  return [...outsidePageAsk(library, entry, how), ...enters]
}

// 作るページを問う、タイプ type の空のページ（問うためだけの物。紙と向きはタイプの規定の既定）。タイプが機能台帳に無ければ undefined
function newPageOf(catalog: CoreCatalog, type: string): ItemPage | undefined {
  const def = catalog.pageTypes.get(type)
  if (!def) return undefined
  return {
    kind: "page",
    id: "new-page",
    type: def.id,
    title: "new page",
    paper: def.paper.default,
    orientation: def.paper.orientation,
  }
}

// 書庫が対象のアクションが変える物 targets（許可スコープから出した物）を、書庫 library で行う前に問う相手の並び（書庫に無いブックには問わない。
// 作るブックは空のブック NEW_BOOK、作るページはそのタイプの空のページで問う）
export function libraryAsksOf(catalog: CoreCatalog, library: Library, targets: LibraryTargets): LibraryAsk[] {
  const books = libraryOf(library)
  const pages = (targets.pages ?? []).flatMap((p): EntryAsk[] => {
    const into =
      p.into === undefined
        ? undefined
        : library.folders[p.into]?.folderRole === "book"
          ? p.into
          : bookIdOf(library.folders, p.into)
    if (into !== undefined) return [{ book: into, where: { creates: p.creates } }]
    const made = newPageOf(catalog, p.creates)
    return made ? [{ page: { page: made, folders: [] } }] : []
  })
  const named: EntryAsk[] = [
    ...targets.books,
    ...(targets.entries ?? []).flatMap(e => asksOfEntry(library, e.entry, e.where, e.into)),
    ...pages,
  ]
  const found = named.flatMap((a): LibraryAsk[] => {
    if ("page" in a) return [a]
    const book = books[a.book]
    return book ? [{ book, where: a.where }] : []
  })
  return targets.creates ? [...found, { book: NEW_BOOK, where: {} }] : found
}

// 書庫 library の、ゴミ箱かその中に無いページの行
const pagesOutsideTrash = (library: Library): Library["pages"] =>
  Object.fromEntries(Object.entries(library.pages).filter(([id]) => !inTrash(library.folders, id)))

// 書庫が対象のアクションの結果で、変わったブック・無くなったブック・増えたブックと、ブックの外で変わったページ・ブックとの間を出入りしたページ（pageChecksBetween）の
// どれかが守っていなければ、守らせたステップの id と、そのブックの id（増えたブックとページなら無い）
// was と now は、行う前と後の書庫（置き場所が変わったブックは、値が変わらなくても確かめる。フォルダごとゴミ箱に出入りしたときの、中のブックも）
export function brokenIn(
  ctx: ActionContext,
  action: ActionDef,
  was: Library,
  now: Library,
): { permission: string; book?: string } | null {
  const before = libraryOf(was)
  const after = libraryOf(now)
  const binned = binnedBetween(was, now)
  // ブックの間か外と動いたページを、足した・消したでなく、動いた物として渡す（ゴミ箱との出し入れは、足した・消した物のまま）
  const rows: LibraryPageRows = { was: pagesOutsideTrash(was), now: pagesOutsideTrash(now) }
  for (const b of Object.values(before)) {
    const place = after[b.id] ? placeChangeOf(was, now, b.id, binned) : "same"
    const id = b === after[b.id] && place === "same" ? null : broken(ctx, action, b, after[b.id], place, rows)
    if (id) return { permission: id, book: b.id }
  }
  for (const b of Object.values(after)) {
    const made = inTrash(now.folders, b.id) ? "trashed" : "same"
    const id = b.id in before ? null : broken(ctx, action, undefined, b, made, rows)
    if (id) return { permission: id }
  }
  for (const page of pageChecksBetween(was, now)) {
    const id = brokenPage(ctx, action, page)
    if (id) return { permission: id }
  }
  return null
}

// 書庫が対象のアクションが返した書庫 after の、変わったページ（ブックの中でも外でも）を 1 枚ずつ、行う前の書庫 was の同じページと比べて整えた書庫
// （どれかが整えられなければ null）
export function normalizedLibrary(
  catalog: CoreCatalog,
  action: ActionDef,
  was: Library,
  after: Library,
): Library | null {
  const tidied: Record<string, PageRow> = {}
  for (const [id, row] of Object.entries(after.pages)) {
    const prev = was.pages[id]
    if (row === prev) continue
    const done = normalizedPage(catalog, action, prev, row)
    if (!done) return null
    if (done !== row) tidied[id] = done as PageRow
  }
  return Object.keys(tidied).length === 0 ? after : { ...after, pages: { ...after.pages, ...tidied } }
}

// 書庫が was から now に変わる間に、システムフォルダの決まりを守るか: 行う前から在るフォルダの行の印（systemFolder）は変わらない（付けも外しもしない）。
// 印の付いた行を足せるのは、印の定義が機能台帳に在るときだけ。定義が機能台帳に在る印の行は、ゴミ箱の外に在れば、ゴミ箱に入れず消さない
// （定義の無い間は、ゴミ箱に入れられる。いくつ在ってよいか・どこに在るかは、木の決まり treeHolds が見る）
export function systemFoldersKept(catalog: CoreCatalog, was: Library, now: Library): boolean {
  for (const [id, f] of Object.entries(now.folders)) {
    const before = was.folders[id]
    const mark = systemFolderOf(f)
    if (before ? systemFolderOf(before) !== mark : mark !== undefined && !catalog.systemFolders.has(mark)) return false
  }
  return Object.keys(was.folders).every(
    id =>
      !isKeptSystemFolder(was.folders, id, catalog.systemFolders) ||
      (now.folders[id] !== undefined && !inTrash(now.folders, id)),
  )
}

// 作るブックを認可ステップに問うときの、空のブック（問うためだけの物）
export const NEW_BOOK: Book = { id: "new-book", title: "new book", lineup: [] }
