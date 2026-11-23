// 書庫が対象のアクションの、行う前に問う相手と、行った後の確かめ（守らせること・整え・システムフォルダの決まり）

import type { LibraryPageRows } from "./changes"
import type { CoreCatalog } from "./core-catalog"
import type { ActionContext, ActionDef, EntryWhere, LibraryTargets, Where } from "./def/action"
import type { PlaceEntry, PlaceFolder, PlacePermissionCheck } from "./def/permission"
import { binnedBetween, type EntryKind, isWithin } from "./entries"
import { type Folder, type Folders, isOpenRole, type Library, type PageRow } from "./folders"
import { libraryOf } from "./folders-books"
import { bookIdOf, foldersOver, inTrash, isKeptSystemFolder, permissionFoldersOf, systemFolderOf } from "./folders-tree"
import type { AskedPage, AskedPlace } from "./inspect"
import { splitId } from "./names"
import {
  backyardEntriesBetween,
  broken,
  brokenPage,
  normalizedPage,
  pageChecksBetween,
  placeChangeOf,
} from "./perform-checks"
import { inputFor } from "./permission-input"
import type { ItemPage } from "./placed"
import type { BinderEntry, Book } from "./schema/book"

// 書庫が対象のアクションの、行う前に問う相手: ブック book とその中の所 where か、ページそのもの（ブックの外のページか作るページ。core/inspect.ts の AskedPage）か、
// 置き場所（書庫のフォルダに入れる・作る物。core/inspect.ts の AskedPlace）
export type LibraryAsk = { book: Book; where: Where } | { page: AskedPage } | { place: AskedPlace }
// エントリから出した問う相手（ブックは id）
type EntryAsk = { book: string; where: Where } | { page: AskedPage } | { place: AskedPlace }

// 置き場所の問いと確かめに見せる、フォルダ id とその上の書庫のフォルダの列（近い順）。id が書庫のフォルダ（書庫ホーム・フォルダ）でないか、ゴミ箱の中なら none
export function placeFoldersOf(folders: Folders, id: string): readonly PlaceFolder[] | "none" {
  const row = folders[id]
  if (!isPlaceFolder(row) || inTrash(folders, id)) return "none"
  const over = foldersOver(folders, id)
  return over.every(isPlaceFolder) ? [row, ...over] : "none"
}
const isPlaceFolder = (row: Folder | undefined): row is PlaceFolder =>
  row?.folderRole === "home" || row?.folderRole === "folder"

// 書庫 folders のエントリ id の直の入れ物の id（無ければ undefined）
const holderOf = (folders: Folders, id: string): string | undefined => foldersOver(folders, id)[0]?.id

// エントリ entry を、フォルダ into に入れる・作るときの置き場所の問い（into が書庫のフォルダでなければ、問わない）
function placeAsk(library: Library, into: string, entry: PlaceEntry): EntryAsk[] {
  const over = placeFoldersOf(library.folders, into)
  return over === "none" ? [] : [{ place: { into: over, entry } }]
}

// 書庫 library のエントリ id の種類（表に無ければ undefined）
function entryKindOf(library: Library, id: string): EntryKind | undefined {
  if (id in library.pages) return "page"
  const role = library.folders[id]?.folderRole
  return role === "book" ? "book" : role === "binder" ? "binder" : role === "folder" ? "folder" : undefined
}

// 名指したエントリ entry の、置き場所の問い: 動かす（place）なら動かす先 into（今の直の入れ物と同じなら問わない）、写す（copy）なら今の直の入れ物
function entryPlaceAsks(library: Library, entry: string, how: EntryWhere, into?: string): EntryAsk[] {
  const kind = entryKindOf(library, entry)
  if (kind === undefined) return []
  const holder = holderOf(library.folders, entry)
  if (how === "copy") return holder === undefined ? [] : placeAsk(library, holder, { kind, made: "new" })
  if (how !== "place" || into === undefined || into === holder) return []
  return placeAsk(library, into, { kind, id: entry })
}

// 書庫 library のブックの外のページ id を、エントリの変え方 how で問う相手（表に無いページには問わない）
function outsidePageAsk(library: Library, id: string, how: EntryWhere): EntryAsk[] {
  const row = library.pages[id]
  if (!row) return []
  return [{ page: { page: row, folders: permissionFoldersOf(library.folders, id), where: { entry: how } } }]
}

// 書庫が対象のアクションが名指したエントリ entry を where のとおりに変えるとき、行う前に問う相手:
// ブックならそのブック、フォルダなら中のブックの全部と、中のブックの外のページの全部（名前だけ・複製だけなら、どれにも問わない）、ブックの中のページ・バインダなら、そのブックのそのエントリ
// （動かす・名前を変えるなら、その印 entriesChange を添える）、ブックの外のページならそのページ、ブックの外のバインダなら中のページの全部（名前だけ・複製だけ・設定の項目の値だけなら問わない）。
// フォルダは、設定の項目の値だけなら、どれにも問わない（フォルダは設定の項目の値を持たない）。
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
    if (how === "title" || how === "copy" || how === "settings") return []
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
    return how === "title" || how === "copy" || how === "settings"
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
    const placed = p.into === undefined ? [] : placeAsk(library, p.into, { kind: "page", made: "new" })
    return made ? [{ page: { page: made, folders: [] } }, ...placed] : placed
  })
  const named: EntryAsk[] = [
    ...targets.books,
    ...(targets.entries ?? []).flatMap(e => [
      ...asksOfEntry(library, e.entry, e.where, e.into),
      ...entryPlaceAsks(library, e.entry, e.where, e.into),
    ]),
    ...pages,
    ...targets.creates.flatMap(c =>
      c.into === undefined ? [] : placeAsk(library, c.into, { kind: c.kind, made: "new" }),
    ),
  ]
  const found = named.flatMap((a): LibraryAsk[] => {
    if (!("book" in a)) return [a]
    const book = books[a.book]
    return book ? [{ book, where: a.where }] : []
  })
  return targets.creates.some(c => c.kind === "book") ? [...found, { book: NEW_BOOK, where: {} }] : found
}

// ブックが対象のアクションを、ブックの外のバインダ binder（中のページごと）に行う前に問う相手: アクションが変える所 where（許可スコープから出した所。分からなければ無い）を、
// ページそのものに直す。丸ごと変えるページ（page）と、どのページも変える（allPages）・バインダをエントリとして名指した（entries にバインダの id）ときの中のページの全部は、そのページで問う。
// エントリとして名指したページ（動かす・複製する。そのページの中身は変えない）は、置き場所だけを変える物として問い、作るページは、そのタイプの空のページで問う。
// 所が無いか、名指した物がバインダの中に無ければ、何にも問わない。folders は、中のページの認可ステップに見せるフォルダの列（どのページも同じ。core/folders-tree.ts の permissionFoldersOf）
export function binderAsksOf(
  catalog: CoreCatalog,
  binder: BinderEntry,
  folders: readonly Folder[],
  where: Where | undefined,
): AskedPage[] {
  if (!where) return []
  const asked = (id: string, at?: AskedPage["where"]): AskedPage[] => {
    const page = binder.lineup.find(p => p.id === id)
    return page ? [{ page, folders: [...folders], ...(at ? { where: at } : {}) }] : []
  }
  const all = (): AskedPage[] => binder.lineup.flatMap(p => asked(p.id))
  if (where.allPages) return all()
  const made = where.creates === undefined ? undefined : newPageOf(catalog, where.creates)
  return [
    ...(where.page === undefined ? [] : asked(where.page, where.ids ? { ids: where.ids } : undefined)),
    ...(where.entries ?? []).flatMap(e => (e === binder.id ? all() : asked(e, { entry: "place" }))),
    ...(made ? [{ page: made, folders: [] }] : []),
  ]
}

// 書庫 library の、ゴミ箱かその中に無いページの行
const pagesOutsideTrash = (library: Library): Library["pages"] =>
  Object.fromEntries(Object.entries(library.pages).filter(([id]) => !inTrash(library.folders, id)))

// 書庫が対象のアクションの結果で、変わったブック・無くなったブック・増えたブックと、ブックの外で変わったページ・ブックとの間を出入りしたページ（pageChecksBetween）の
// どれかが守っていなければ、守らせたステップの id と、そのブックの id（増えたブックとページなら無い）
// was と now は、行う前と後の書庫（置き場所が変わったブックは、値が変わらなくても確かめる。フォルダごとゴミ箱に出入りしたときの、中のブックも）。
// by が "follow" なら、フォローステップが応じた変わり（バックヤードの中に行う事）で、followed を持つステップだけをかける
export function brokenIn(
  given: ActionContext,
  action: ActionDef,
  was: Library,
  now: Library,
  by: "action" | "follow" = "action",
): { permission: string; book?: string; page?: string } | null {
  const ctx =
    by === "action"
      ? given
      : {
          ...given,
          catalog: {
            ...given.catalog,
            permissions: new Map([...given.catalog.permissions].filter(([, p]) => p.followed)),
          },
        }
  const before = libraryOf(was)
  const after = libraryOf(now)
  const binned = binnedBetween(was, now)
  // ブックの間か外と動いたページを、足した・消したでなく、動いた物として渡す（ゴミ箱との出し入れは、足した・消した物のまま）
  const rows: LibraryPageRows = { was: pagesOutsideTrash(was), now: pagesOutsideTrash(now) }
  for (const b of Object.values(before)) {
    const place = after[b.id] ? placeChangeOf(was, now, b.id, binned) : "same"
    const id =
      b === after[b.id] && place === "same"
        ? null
        : broken(ctx, action, b, after[b.id], backyardEntriesBetween(was.folders, b.id, now.folders, b.id), place, rows)
    if (id) return { permission: id, book: b.id }
  }
  for (const b of Object.values(after)) {
    const made = inTrash(now.folders, b.id) ? "trashed" : "same"
    const id =
      b.id in before
        ? null
        : broken(
            ctx,
            action,
            undefined,
            b,
            backyardEntriesBetween(was.folders, undefined, now.folders, b.id),
            made,
            rows,
          )
    if (id) return { permission: id }
  }
  // 中へ入ったページから土台が消した値は、アクションが変えた事に数えない（行う前のページも、消した姿で比べる）
  const entered = rowsLosingOutermostSettings(ctx.catalog, was, { pages: was.pages, folders: now.folders }).pages
  for (const page of pageChecksBetween({ pages: { ...was.pages, ...entered }, folders: was.folders }, now)) {
    const id = brokenPage(ctx, action, page)
    const held = page.before?.id
    if (id) return { permission: id, ...(held === undefined ? {} : { page: held }) }
  }
  for (const c of placeChecksBetween(was, now))
    for (const p of ctx.catalog.permissions.values())
      if (p.keeps && !p.keeps({ kind: "place", action, ...c, actor: ctx.actor }, inputFor(ctx.catalog, ctx, p)))
        return { permission: p.id }
  return null
}

type PlaceCheck = Omit<PlacePermissionCheck, "kind" | "action" | "actor">

// 書庫が was から now に変わる間の、置き場所の確かめ（直の入れ物が変わった・増えたエントリごと。前も後も書庫のフォルダの外なら入れない）
export function placeChecksBetween(was: Library, now: Library): PlaceCheck[] {
  const ids = new Set([
    ...Object.keys(was.pages),
    ...Object.keys(now.pages),
    ...Object.keys(was.folders),
    ...Object.keys(now.folders),
  ])
  return [...ids].flatMap(id => {
    const from = holderOf(was.folders, id)
    const to = holderOf(now.folders, id)
    const kind = entryKindOf(now, id) ?? entryKindOf(was, id)
    if (from === to || kind === undefined) return []
    const before = from === undefined ? "none" : placeFoldersOf(was.folders, from)
    const after = to === undefined ? "none" : placeFoldersOf(now.folders, to)
    return before === "none" && after === "none" ? [] : [{ entry: { kind, id }, before, after }]
  })
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
  const done = Object.keys(tidied).length === 0 ? after : { ...after, pages: { ...after.pages, ...tidied } }
  const lost = rowsLosingOutermostSettings(catalog, was, done)
  if (Object.keys(lost.pages).length === 0 && Object.keys(lost.folders).length === 0) return done
  return { pages: { ...done.pages, ...lost.pages }, folders: { ...done.folders, ...lost.folders } }
}

// 書庫が was から after に変わる間に、ブックかバインダの中へ入って、ステージエントリが持つ設定の項目の値を失う行（並びが変わったブック・バインダの中のページと、ブックの中のバインダ。
// 値を消した姿で返す。その値を持つのはステージエントリだけ。機能台帳に無い項目の値は残す）
export function rowsLosingOutermostSettings(
  catalog: CoreCatalog,
  was: Library,
  after: Library,
): { pages: Record<string, PageRow>; folders: Record<string, Folder> } {
  const pages: Record<string, PageRow> = {}
  const folders: Record<string, Folder> = {}
  for (const row of Object.values(after.folders)) {
    if (row === was.folders[row.id] || (row.folderRole !== "book" && row.folderRole !== "binder")) continue
    for (const ref of row.lineup) {
      const page = ref.kind === "page" ? after.pages[ref.id] : undefined
      const binder = ref.kind === "binder" ? after.folders[ref.id] : undefined
      const pageNow = page && withoutOutermostSettings(catalog, page as PageRow & { settings?: object })
      if (page && pageNow !== page) pages[page.id] = pageNow as PageRow
      const binderNow = binder?.folderRole === "binder" ? withoutOutermostSettings(catalog, binder) : binder
      if (binder && binderNow !== binder) folders[binder.id] = binderNow as Folder
    }
  }
  return { pages, folders }
}

// 行 row から、ステージエントリが持つ設定の項目の値を消した行（1 つも持たなければ row のまま）
function withoutOutermostSettings<T extends { settings?: object }>(catalog: CoreCatalog, row: T): T {
  const own = row.settings as Readonly<Record<string, unknown>> | undefined
  const held = (id: string) => catalog.settings.get(id)?.holder === "outermost"
  if (!own || !Object.keys(own).some(held)) return row
  const rest = Object.fromEntries(Object.entries(own).filter(([k]) => !held(k)))
  const { settings: _, ...fields } = row
  return (Object.keys(rest).length === 0 ? fields : { ...fields, settings: rest }) as T
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

// 書庫が was から now に変わる間に、バックヤードの決まりを守らない訳（守れば null）: バックヤードに在るブックは名前を変えない（持ち主は名前でなく workKey で引く）。
// バックヤードに新しく作るブックは、そのバックヤードの持ち主のプラグインのアクションだけが作る（読めない物のフォルダから戻す物は、前から在るので作るでない）
export function backyardBreach(action: ActionDef, was: Library, now: Library): string | null {
  for (const row of Object.values(now.folders)) {
    if (row.folderRole !== "backyard") continue
    for (const ref of row.lineup) {
      const before = was.folders[ref.id]
      if (!before) {
        if (splitId(row.backyard).owner !== splitId(action.id).owner)
          return "only the plugin that owns a backyard makes books in it"
        continue
      }
      const after = now.folders[ref.id]
      if (before.folderRole === "book" && after?.folderRole === "book" && after.title !== before.title)
        return "a book in a backyard cannot be renamed"
    }
  }
  return null
}
