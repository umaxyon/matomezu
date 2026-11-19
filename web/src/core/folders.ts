// ページとフォルダの表: 世界と保存の単位。ページは 1 枚ずつ、フォルダは 1 つずつ持ち、フォルダが中身（エントリ）の id を順に持つ（ページは、自分の入っているフォルダを持たない）。
// フォルダは、書庫ホーム（folderRole が "home"）か、ゴミ箱（"trash"）か、フォルダ（"folder"）か、ブック（"book"。エントリはページとバインダ）か、
// バインダ（"binder"。1 つのタイプのページだけ）。書庫ホームとゴミ箱は、ただ 1 つずつで、どのフォルダにも入らない。そのほかのページとフォルダは、ちょうど 1 つのフォルダに入る。
// ブック（core/schema/book.ts の Book）は、ブックのフォルダと、その下のバインダ・ページの中身をまとめた、読む用の値。ここの関数が表から組み、変えた結果を表への書き込みに分ける
// （組むのと分けるのは、ここだけ。同じページが 2 つの値に入らないよう、持つのは表の方）

import { z } from "zod"
import { applyPatch, CLASH, type Patch, toPutBack } from "./patch"
import { REMOVED } from "./records"
import { sameData } from "./same"
import type { AnyPage, BinderEntry, Book, LineupEntry, UnreadableEntry } from "./schema/book"

// フォルダが持つエントリ 1 つ: ページかバインダの id
export interface PageRef {
  kind: "page"
  id: string
}
export interface BinderRef {
  kind: "binder"
  id: string
}
export type EntryRef = PageRef | BinderRef
export interface BookRef {
  kind: "book"
  id: string
}
export interface FolderRef {
  kind: "folder"
  id: string
}
// 書庫ホーム・ゴミ箱・フォルダが持つエントリ 1 つ: ページ・バインダ・ブック・フォルダのどれかの id
export type AnyEntryRef = EntryRef | BookRef | FolderRef

// 書庫ホームの id（決まった値。書庫ホームは、この id のフォルダただ 1 つ）
export const HOME_ID = "library-home"
// ゴミ箱の id（決まった値。ゴミ箱は、この id のフォルダただ 1 つ）
export const TRASH_ID = "library-trash"
// ゴミ箱の並びのエントリ 1 つ: 入れた物の id と、入れた時刻 trashed と、元いたフォルダから上への id の列 from（近い順。戻す先を決めるのに使う）
export type TrashRef = AnyEntryRef & { trashed: string; from: readonly string[] }

// ブックのフォルダ: ブックのフィールド（名前・ロック・ブックが持つ設定の項目）と、エントリの id の並び
export type BookFolder = Omit<Book, "lineup"> & { folderRole: "book"; lineup: readonly EntryRef[] }
// バインダ: 名前と、入れるページのタイプと、ページの id の並び
export interface BinderFolder {
  folderRole: "binder"
  id: string
  title: string
  pageType: string
  lineup: readonly PageRef[]
}
// 書庫ホーム: 書庫の一番上のフォルダ。名前は持たない
export interface HomeFolder {
  folderRole: "home"
  id: typeof HOME_ID
  lineup: readonly AnyEntryRef[]
}
// フォルダ（ブックでもバインダでもない物）: 名前と、エントリの id の並び。システムフォルダ（core/def/system-folder.ts）は、名前の代わりに
// 印 systemFolder（システムフォルダの定義の id）を持つ（名前は定義から引く。core/entries.ts の rowTitle）
export type PlainFolder = {
  folderRole: "folder"
  id: string
  lineup: readonly AnyEntryRef[]
} & ({ title: string; systemFolder?: never } | { systemFolder: string; title?: never })
// ゴミ箱: 書庫ホームと並ぶ、書庫の一番上のフォルダ。名前は持たない
export interface TrashFolder {
  folderRole: "trash"
  id: typeof TRASH_ID
  lineup: readonly TrashRef[]
}
// 書庫ホームかゴミ箱かフォルダ（ブックを組む値には入らず、表にだけ在る）
export type HomeOrFolder = HomeFolder | TrashFolder | PlainFolder
export type Folder = BookFolder | BinderFolder | HomeOrFolder

// 書庫の一番上のフォルダ（どのフォルダにも入らない）の役か: 書庫ホームとゴミ箱
export const isTopRole = (role: unknown): role is "home" | "trash" => role === "home" || role === "trash"
// ページ・バインダ・ブック・フォルダの 4 つとも持てる役か: 書庫ホーム・ゴミ箱・フォルダ（ブックにもバインダにもならない役）
export const isOpenRole = (role: unknown): role is HomeOrFolder["folderRole"] => isTopRole(role) || role === "folder"

const AnyEntryRefSchema = z.strictObject({ kind: z.enum(["page", "binder", "book", "folder"]), id: z.string().min(1) })
const TrashRefSchema = AnyEntryRefSchema.extend({ trashed: z.string().min(1), from: z.array(z.string().min(1)) })
const HomeOrFolderSchema = z.union([
  z.strictObject({ folderRole: z.literal("home"), id: z.literal(HOME_ID), lineup: z.array(AnyEntryRefSchema) }),
  z.strictObject({ folderRole: z.literal("trash"), id: z.literal(TRASH_ID), lineup: z.array(TrashRefSchema) }),
  // フォルダは名前を持ち、システムフォルダは名前の代わりに印を持つ（両方は持たない）
  z.strictObject({
    folderRole: z.literal("folder"),
    id: z.string().min(1),
    title: z.string().min(1),
    lineup: z.array(AnyEntryRefSchema),
  }),
  z.strictObject({
    folderRole: z.literal("folder"),
    id: z.string().min(1),
    systemFolder: z.string().min(1),
    lineup: z.array(AnyEntryRefSchema),
  }),
])

// 書庫ホーム・ゴミ箱・フォルダの行 row が、形に合うか
export const homeOrFolderHolds = (row: unknown): boolean => HomeOrFolderSchema.safeParse(row).success

// ブックとバインダの行から、木の決まりに要る所だけを読む形
const LooseFolderSchema = z.looseObject({
  id: z.string().min(1),
  folderRole: z.unknown().optional(),
  lineup: z.array(z.unknown()).catch([]),
})
const LooseRefSchema = z.looseObject({ kind: z.string(), id: z.string().min(1) })

// フォルダの行が書庫ホーム・ゴミ箱・フォルダの役を名乗るか（形は確かめない）
const namesHomeOrFolder = (row: unknown): boolean =>
  typeof row === "object" && row !== null && isOpenRole((row as { folderRole?: unknown }).folderRole)

// 置き場所から読んだままのフォルダ folders のうち、書庫ホーム・ゴミ箱・フォルダ（形に合う物だけ。合わない物は入らず、木の決まり treeHolds が破れて見える）
export function homeAndFoldersOf(folders: readonly unknown[]): HomeOrFolder[] {
  return folders.flatMap(f => {
    const parsed = namesHomeOrFolder(f) ? HomeOrFolderSchema.safeParse(f) : undefined
    return parsed?.success ? [parsed.data as HomeOrFolder] : []
  })
}

// ブック books だけを直下に持つ書庫ホーム（ブックの並びから世界を作るときの、置き場所）
export const homeOver = (books: readonly { id: string }[]): HomeFolder => ({
  folderRole: "home",
  id: HOME_ID,
  lineup: books.map(b => ({ kind: "book", id: b.id })),
})

// 世界の表: ブック books を分けた表に、書庫ホームとフォルダ others を足した物
export function worldTablesOf(books: readonly Book[], others: readonly HomeOrFolder[]): Library {
  const tables = tablesOf(books)
  if (others.length === 0) return tables
  return { pages: tables.pages, folders: { ...tables.folders, ...Object.fromEntries(others.map(f => [f.id, f])) } }
}

// ページの表の 1 行: ページか、読めないページ（今の機能台帳では読めないページ。id・名前・理由の番号だけで、残したデータは置き場所に残る。
// フォルダのエントリは、どちらも kind が "page" の id で指す）
export type PageRow = AnyPage | UnreadableEntry
export type Pages = Readonly<Record<string, PageRow>>
export type Folders = Readonly<Record<string, Folder>>
// ページの表とフォルダの表
export interface Library {
  pages: Pages
  folders: Folders
}

// 1 回のアクションが変えたページとフォルダ（id → 新しい値。無くなった物は removed）
export interface TableChanges {
  pages: Readonly<Record<string, PageRow | typeof REMOVED>>
  folders: Readonly<Record<string, Folder | typeof REMOVED>>
}
export const NO_CHANGES: TableChanges = { pages: {}, folders: {} }

const ref = (e: { id: string }): PageRef => ({ kind: "page", id: e.id })

// 分けた物の覚え: 同じブックは、同じフォルダの値に分ける（分けて組み直すと、元のブックの値に戻る。読み直しのたびに、変わっていないブックを作り直さない）
const recordsKept = new WeakMap<Book, { folders: Folder[]; pages: PageRow[] }>()

// ブック book を、フォルダ（ブックのフォルダと、その下のバインダ）とページに分けた物
export function recordsOf(book: Book): { folders: Folder[]; pages: PageRow[] } {
  const kept = recordsKept.get(book)
  if (kept) return kept
  const made = split(book)
  recordsKept.set(book, made)
  return made
}

function split(book: Book): { folders: Folder[]; pages: PageRow[] } {
  const { lineup, ...fields } = book
  const binders = lineup.flatMap(e => (e.kind === "binder" ? [e] : []))
  const own: BookFolder = {
    ...fields,
    folderRole: "book",
    lineup: lineup.map((e): EntryRef => (e.kind === "binder" ? { kind: "binder", id: e.id } : ref(e))),
  } as BookFolder
  // 分けたフォルダから組み直すと、元のブックとバインダの値になるよう覚えておく
  bookKept.set(own, { parts: lineup, made: book })
  return {
    folders: [
      own,
      ...binders.map(f => {
        const folder: BinderFolder = {
          folderRole: "binder",
          id: f.id,
          title: f.title,
          pageType: f.pageType,
          lineup: f.lineup.map(ref),
        }
        binderKept.set(folder, { parts: f.lineup, made: f })
        return folder
      }),
    ],
    pages: lineup.flatMap((e): readonly PageRow[] => (e.kind === "binder" ? e.lineup : [e])),
  }
}

// ブックの並び books を、ページの表とフォルダの表にした物
export function tablesOf(books: readonly Book[]): Library {
  const pages: Record<string, PageRow> = {}
  const folders: Record<string, Folder> = {}
  for (const book of books) {
    const records = recordsOf(book)
    for (const f of records.folders) folders[f.id] = f
    for (const p of records.pages) pages[p.id] = p
  }
  return { pages, folders }
}

// 組んだ値の覚え: フォルダと、その中身（組むのに使った物）が同じなら、同じ値を返す（変わっていないブック・バインダを描き直させない）
interface Kept<T> {
  parts: readonly unknown[]
  made: T
}
const sameParts = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])
const binderKept = new WeakMap<BinderFolder, Kept<BinderEntry>>()
const bookKept = new WeakMap<BookFolder, Kept<Book>>()

// バインダ folder を、中のページごと組んだエントリ（中のページが表に 1 枚でも無ければ undefined）
function binderOf(pages: Pages, folder: BinderFolder): BinderEntry | undefined {
  const parts = folder.lineup.map(r => pages[r.id])
  if (parts.some(p => p === undefined)) return undefined
  const kept = binderKept.get(folder)
  if (kept && sameParts(kept.parts, parts)) return kept.made
  const made: BinderEntry = {
    kind: "binder",
    id: folder.id,
    title: folder.title,
    pageType: folder.pageType,
    lineup: parts as PageRow[],
  }
  binderKept.set(folder, { parts, made })
  return made
}

// id のブックを、表から組んだ値（ブックのフォルダが無い・バインダ・エントリが表に無ければ undefined）
export function bookOf({ pages, folders }: Library, id: string): Book | undefined {
  const folder = folders[id]
  if (folder?.folderRole !== "book") return undefined
  const parts: (LineupEntry | undefined)[] = folder.lineup.map(r => {
    if (r.kind === "page") return pages[r.id]
    const binder = folders[r.id]
    return binder?.folderRole === "binder" ? binderOf(pages, binder) : undefined
  })
  if (parts.some(p => p === undefined)) return undefined
  const kept = bookKept.get(folder)
  if (kept && sameParts(kept.parts, parts)) return kept.made
  const { folderRole: _, lineup: __, ...fields } = folder
  const made = { ...fields, lineup: parts as LineupEntry[] } as Book
  bookKept.set(folder, { parts, made })
  return made
}

// 表のブックを全部組んだ一覧（ブックの id → ブック。ゴミ箱のブックも）。前に組んだ一覧と中身が同じなら、同じ値を返す
let lastLibrary: Readonly<Record<string, Book>> = {}
export function libraryOf(tables: Library): Readonly<Record<string, Book>> {
  const next: Record<string, Book> = {}
  for (const f of Object.values(tables.folders)) {
    const book = f.folderRole === "book" ? bookOf(tables, f.id) : undefined
    if (book) next[book.id] = book
  }
  const ids = Object.keys(next)
  if (ids.length === Object.keys(lastLibrary).length && ids.every(id => lastLibrary[id] === next[id]))
    return lastLibrary
  lastLibrary = next
  return next
}

// ブックのフォルダ folder の下の、バインダとページの id（表に無い物の id も）
function rowIdsUnder(folders: Folders, folder: Folder): { folders: string[]; pages: string[] } {
  const out = { folders: [] as string[], pages: [] as string[] }
  for (const r of folder.lineup) {
    if (r.kind === "page") out.pages.push(r.id)
    if (r.kind !== "binder") continue
    out.folders.push(r.id)
    const binder = folders[r.id]
    if (binder?.folderRole === "binder") out.pages.push(...binder.lineup.map(p => p.id))
  }
  return out
}

// 書庫 library から、id のブックのフォルダと、その下のバインダとページを外した書庫（ブックのフォルダが無ければ library のまま。入れているフォルダの並びは変えない）
export function withoutBook(library: Library, id: string): Library {
  const folder = library.folders[id]
  if (folder?.folderRole !== "book") return library
  const under = rowIdsUnder(library.folders, folder)
  const gone = new Set([id, ...under.folders])
  const pages = new Set(under.pages)
  return {
    pages: Object.fromEntries(Object.entries(library.pages).filter(([p]) => !pages.has(p))),
    folders: Object.fromEntries(Object.entries(library.folders).filter(([f]) => !gone.has(f))),
  }
}

// 書庫 library に、ブックの値 book を置いた書庫: 同じ id のブックが在れば置き換え（前に持っていて book に無いバインダとページは外す）、無ければ足す
// （入れるフォルダの並びには足さない）。中身の同じ行は、前の値のまま残す
export function withBook(library: Library, book: Book): Library {
  const rows = recordsOf(book)
  const base = withoutBook(library, book.id)
  const kept = <T>(was: T | undefined, now: T): T => (was !== undefined && sameData(was, now) ? was : now)
  const pages = { ...base.pages }
  for (const p of rows.pages) pages[p.id] = kept(library.pages[p.id], p)
  const folders = { ...base.folders }
  for (const f of rows.folders) folders[f.id] = kept(library.folders[f.id], f)
  return { pages, folders }
}

// エントリ（ページかバインダ）の id → それを入れているフォルダの id
const placesKept = new WeakMap<Folders, ReadonlyMap<string, string>>()
function placesOf(folders: Folders): ReadonlyMap<string, string> {
  const kept = placesKept.get(folders)
  if (kept) return kept
  const places = new Map<string, string>()
  for (const f of Object.values(folders)) for (const r of f.lineup) places.set(r.id, f.id)
  placesKept.set(folders, places)
  return places
}

// エントリ entry を入れているフォルダの列（近い順。バインダの中のページなら、バインダ → ブック → … → 書庫ホーム。どこにも入っていなければ空。輪になっていたら、そこで止める）
export function foldersOver(folders: Folders, entry: string): Folder[] {
  const places = placesOf(folders)
  const over: Folder[] = []
  const passed = new Set<string>()
  for (let at = places.get(entry); at !== undefined && !passed.has(at); at = places.get(at)) {
    const folder = folders[at]
    if (!folder) break
    passed.add(at)
    over.push(folder)
  }
  return over
}

// 書庫ホーム・ゴミ箱・フォルダのエントリ r の種類が、表の中身と合うか（表に無い book は通す。読めないブックは、表に入らない）
function refFits(pages: Pages, folders: Folders, r: AnyEntryRef): boolean {
  if (r.kind === "page") return Object.hasOwn(pages, r.id)
  const row = folders[r.id]
  if (r.kind === "book") return !row || row.folderRole === "book"
  return row?.folderRole === r.kind
}

// フォルダ f がシステムフォルダなら、その印（システムフォルダの定義の id）。ほかは undefined
export const systemFolderOf = (f: Folder | undefined): string | undefined =>
  f?.folderRole === "folder" && typeof f.systemFolder === "string" ? f.systemFolder : undefined

// エントリ entry が、ゴミ箱に入れず消さず上書きしないシステムフォルダか: 印の定義が機能台帳の systemFolders に在り、ゴミ箱の外に在る
export const isKeptSystemFolder = (
  folders: Folders,
  entry: string,
  systemFolders: { has(mark: string): boolean },
): boolean => {
  const mark = systemFolderOf(folders[entry])
  return mark !== undefined && systemFolders.has(mark) && !inTrash(folders, entry)
}

// システムフォルダの決まり: システムフォルダは、書庫ホームかゴミ箱の直下だけに在る。書庫ホームの直下では、並びの先頭に、印の順に並ぶ
// （同じ印は、ゴミ箱の外に 1 つだけ）
function systemFoldersHold(folders: Folders, holder: ReadonlyMap<string, string>): boolean {
  for (const f of Object.values(folders)) {
    if (systemFolderOf(f) === undefined) continue
    const at = holder.get(f.id)
    if (at !== HOME_ID && at !== TRASH_ID) return false
  }
  let last: string | undefined
  let pinned = true
  for (const r of folders[HOME_ID]?.lineup ?? []) {
    const mark = r.kind === "folder" ? systemFolderOf(folders[r.id]) : undefined
    if (mark === undefined) {
      pinned = false
      continue
    }
    if (!pinned || (last !== undefined && mark <= last)) return false
    last = mark
  }
  return true
}

// 書庫ホームの直下の、先頭に並ぶシステムフォルダの数（ほかのエントリは、この数より前に置けない）
const pinnedCount = (folders: Folders): number => {
  const lineup = folders[HOME_ID]?.lineup ?? []
  const at = lineup.findIndex(r => r.kind !== "folder" || systemFolderOf(folders[r.id]) === undefined)
  return at < 0 ? lineup.length : at
}

// 印 mark のシステムフォルダを書庫ホームの直下に置くときの、並びの位置（先頭のシステムフォルダのうち、印が mark より前の物の後）
export const systemFolderIndex = (folders: Folders, mark: string): number => {
  const lineup = folders[HOME_ID]?.lineup ?? []
  const pinned = lineup.slice(0, pinnedCount(folders))
  const after = pinned.findIndex(r => (systemFolderOf(folders[r.id]) ?? "") > mark)
  return after < 0 ? pinned.length : after
}

// 木の決まり: 書庫ホームが在る（ゴミ箱は、在れば 1 つ）／書庫ホームとゴミ箱はどのフォルダにも入らない／そのほかのフォルダは、ちょうど 1 つのフォルダに入り、
// 上へたどると書庫ホームかゴミ箱に着く（輪にならない）／ページは、どれかのフォルダ（ブック・バインダを含む）に入る／書庫ホーム・ゴミ箱・フォルダのエントリは、
// 種類が合う（page は表に在るページ、binder はバインダ、folder は表に在るフォルダ、book はブック）／ブックとバインダは、ブックもフォルダも持たない（型が決める）／
// システムフォルダは書庫ホームかゴミ箱の直下だけに在り、書庫ホームでは先頭に印の順に並ぶ（同じ印はゴミ箱の外に 1 つ）
export function treeHolds({ pages, folders }: Library): boolean {
  if (folders[HOME_ID]?.folderRole !== "home") return false
  const trash = folders[TRASH_ID]
  if (trash && trash.folderRole !== "trash") return false
  const holder = new Map<string, string>()
  for (const f of Object.values(folders)) {
    for (const r of f.lineup) {
      if (holder.has(r.id)) return false
      holder.set(r.id, f.id)
      if (isOpenRole(f.folderRole) && !refFits(pages, folders, r)) return false
    }
  }
  const isTop = (id: string | undefined) => id === HOME_ID || id === TRASH_ID
  if (holder.has(HOME_ID) || holder.has(TRASH_ID)) return false
  if (!Object.keys(pages).every(id => holder.has(id))) return false
  if (!systemFoldersHold(folders, holder)) return false
  return Object.values(folders).every(f => {
    const passed = new Set<string>()
    let at: string | undefined = f.id
    while (at !== undefined && !isTop(at) && !passed.has(at)) {
      passed.add(at)
      at = holder.get(at)
    }
    return isTop(at)
  })
}

// エントリ entry が、ゴミ箱の中（何段下でも）に在るか。ゴミ箱そのものは中でない
export const inTrash = (folders: Folders, entry: string): boolean =>
  foldersOver(folders, entry).some(f => f.folderRole === "trash")

// 置き場所から読んだままのフォルダの行の全部 rows（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）と、ページの行の id の全部 pages が、木の決まり treeHolds を守るか。
// 書庫ホーム・ゴミ箱・フォルダは形を確かめ（合わない行は入らない）、ブックとバインダは id と並びのエントリの id だけを読む（読めないブックも、行が在れば木に入る）
export function rowsHoldTree(rows: readonly unknown[], pages: readonly string[]): boolean {
  const folders: Record<string, Folder> = {}
  for (const f of homeAndFoldersOf(rows)) folders[f.id] = f
  for (const row of rows) {
    if (namesHomeOrFolder(row)) continue
    const parsed = LooseFolderSchema.safeParse(row)
    if (!parsed.success) continue
    const { id, folderRole, lineup } = parsed.data
    const refs = lineup.flatMap(r => (LooseRefSchema.safeParse(r).success ? [r as EntryRef] : []))
    folders[id] = { folderRole: folderRole === "binder" ? "binder" : "book", id, lineup: refs } as unknown as Folder
  }
  return treeHolds({ pages: Object.fromEntries(pages.map(id => [id, undefined])), folders } as unknown as Library)
}

// 置き場所から読んだままのフォルダの行 rows（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）とページの行 pages（id → 行）を、形を確かめずに読んだ書庫
// （id と並びの在る行だけ。並びは、種類と id の在るエントリだけ）。名前と置き場所を読むだけの所が使う。形の合わない行も入るので、木の決まりは確かめない
// （形を確かめる homeAndFoldersOf は、常駐が書くたびに呼ぶには重い）
export function rowsLibraryOf(rows: readonly unknown[], pages: Readonly<Record<string, unknown>>): Library {
  const folders: Record<string, Folder> = {}
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue
    const { id, lineup } = row as { id?: unknown; lineup?: unknown }
    if (typeof id !== "string" || !Array.isArray(lineup)) continue
    const refs = lineup.filter(
      (r: unknown) =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as { id?: unknown }).id === "string" &&
        typeof (r as { kind?: unknown }).kind === "string",
    )
    folders[id] = { ...row, lineup: refs } as unknown as Folder
  }
  return { pages, folders } as unknown as Library
}

// 変わり changes（ブックを足す・消す）に、置き場所の書き込みを足した変わり: 足したブックのうち、変わりがどのフォルダにも入れていない物は書庫ホームの末尾に入れ、
// 無くなったブックは、入っていたフォルダの並びから外す
export function placedChanges(tables: Library, changes: TableChanges): TableChanges {
  const made = Object.entries(changes.folders).flatMap(([id, f]) =>
    f !== REMOVED && f.folderRole === "book" && !(id in tables.folders) ? [id] : [],
  )
  const gone = new Set(
    Object.entries(changes.folders).flatMap(([id, f]) =>
      f === REMOVED && tables.folders[id]?.folderRole === "book" ? [id] : [],
    ),
  )
  if (made.length === 0 && gone.size === 0) return changes
  const after = withChanges(tables, changes).folders
  const held = new Set(Object.values(after).flatMap(f => (isOpenRole(f.folderRole) ? f.lineup.map(r => r.id) : [])))
  const added = made.filter(id => !held.has(id))
  const puts: Record<string, Folder> = {}
  for (const f of Object.values(after)) {
    if (!isOpenRole(f.folderRole)) continue
    const kept = f.lineup.filter(r => !gone.has(r.id))
    const fresh = f.folderRole === "home" ? added.map((id): BookRef => ({ kind: "book", id })) : []
    if (kept.length !== f.lineup.length || fresh.length > 0)
      puts[f.id] = { ...f, lineup: [...kept, ...fresh] } as Folder
  }
  return { pages: changes.pages, folders: { ...changes.folders, ...puts } }
}

// ブック book を分けたフォルダの表（同じブックには同じ表を返す）
const foldersKept = new WeakMap<Book, Folders>()
function foldersIn(book: Book): Folders {
  const kept = foldersKept.get(book)
  if (kept) return kept
  const made = Object.fromEntries(recordsOf(book).folders.map(f => [f.id, f]))
  foldersKept.set(book, made)
  return made
}

// ブック book の中のページ page を入れているフォルダの列（近い順）
export const foldersOverIn = (book: Book, page: string): Folder[] => foldersOver(foldersIn(book), page)

// ページ page を持っているブックの id（どのブックにも入っていなければ undefined）
export const bookIdOf = (folders: Folders, page: string): string | undefined =>
  foldersOver(folders, page).find(f => f.folderRole === "book")?.id

// 行う前のブック before を、行った後のブック after にする変わり: 変わった・足したページとフォルダと、無くなったページとフォルダ（どちらにも在って中身が同じ物は入れない）。
// before と after は、1 回のアクションが受けたブックの全部と、返したブックの全部（無くなったブックは after に無い）。ページがブックの間で動いても、
// どちらかに在れば無くなったとはしない
export function changesBetween(before: readonly Book[], after: readonly Book[]): TableChanges {
  return rowChanges(tablesOf(before), tablesOf(after))
}

// 表 was を表 now にする変わり: 変わった・足したページとフォルダと、無くなったページとフォルダ（どちらにも在って中身が同じ物は入れない。作り直しただけの行は変わりにしない）
export function rowChanges(was: Library, now: Library): TableChanges {
  const changed = <T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>) => {
    if (a === b) return {}
    const out: Record<string, T | typeof REMOVED> = {}
    for (const [id, v] of Object.entries(b)) if (a[id] !== v && !sameData(a[id], v)) out[id] = v
    for (const id of Object.keys(a)) if (!(id in b)) out[id] = REMOVED
    return out
  }
  return { pages: changed(was.pages, now.pages), folders: changed(was.folders, now.folders) }
}

// 表 next を、今の表 now に寄せる: 中身の同じページ・フォルダは今の値を使い（組んだブックも同じ値のままになり、描き直しを減らす）、全部同じなら now を返す
export function settledOn(next: Library, now: Library): Library {
  const settled = <T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>) => {
    const kept: Record<string, T> = {}
    for (const [id, v] of Object.entries(a)) {
      const old = b[id]
      kept[id] = old !== undefined && old !== v && sameData(old, v) ? old : v
    }
    const same =
      Object.keys(kept).length === Object.keys(b).length && Object.entries(kept).every(([id, v]) => b[id] === v)
    return same ? b : kept
  }
  const pages = settled(next.pages, now.pages)
  const folders = settled(next.folders, now.folders)
  return pages === now.pages && folders === now.folders ? now : { pages, folders }
}

// 変わり changes が何も変えないか
export const noChanges = (changes: TableChanges): boolean =>
  Object.keys(changes.pages).length === 0 && Object.keys(changes.folders).length === 0

// 表 tables に変わり changes を当てた表（変わらない表は、同じ値のまま）
export function withChanges(tables: Library, changes: TableChanges): Library {
  const applied = <T>(table: Readonly<Record<string, T>>, puts: Readonly<Record<string, T | typeof REMOVED>>) => {
    if (Object.keys(puts).length === 0) return table
    const next: Record<string, T> = { ...table }
    for (const [id, v] of Object.entries(puts)) {
      if (v === REMOVED) delete next[id]
      else next[id] = v as T
    }
    return next
  }
  return { pages: applied(tables.pages, changes.pages), folders: applied(tables.folders, changes.folders) }
}

// 変わり changes が新しく足すページ・フォルダ（行う前のブック before に無かった物）の id
export const createdIn = (before: readonly Book[], changes: TableChanges): string[] =>
  createdOn(tablesOf(before), changes)

// 変わり changes が新しく足すページ・フォルダ（表 was に無かった物）の id
export function createdOn(was: Library, changes: TableChanges): string[] {
  return [
    ...Object.entries(changes.pages).filter(([id, v]) => v !== REMOVED && !(id in was.pages)),
    ...Object.entries(changes.folders).filter(([id, v]) => v !== REMOVED && !(id in was.folders)),
  ].map(([id]) => id)
}

// 置き場所から読んだままのページとフォルダ（形を確かめる前の値）から、ブックの本文（並びにページとバインダの中身ごと持つ形）を組む。確かめるのは、組んだ後（core/book.ts の checkBooks）。
// ブックにするのは、役（folderRole）が書庫ホーム・ゴミ箱・フォルダ・バインダのどれでもないフォルダ（形の壊れた物も、そのまま 1 冊として返す。読めないブックとして見える）。
// エントリが id だけの物（kind と id だけを持つ）なら、表から引いて中身に替える（表に無ければ、そのまま残す）。それより多くを持つエントリは、中身ごと残っている物として、そのまま使う。
// 同じフォルダと同じ中身からは、同じ値を返す（確かめ直しを減らす）
const rawKept = new WeakMap<object, Kept<unknown>>()
export function rawBooksOf(pages: readonly unknown[], folders: readonly unknown[]): unknown[] {
  const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
    typeof v === "object" && v !== null && !Array.isArray(v)
  const byId = (rows: readonly unknown[]) =>
    new Map(rows.flatMap(r => (isObject(r) && typeof r.id === "string" ? [[r.id, r] as const] : [])))
  const page = byId(pages)
  const folder = byId(folders)
  // id だけのエントリ（その kind と id）
  const refOf = (e: unknown): { kind: string; id: string } | undefined =>
    isObject(e) && Object.keys(e).length === 2 && typeof e.kind === "string" && typeof e.id === "string"
      ? { kind: e.kind, id: e.id }
      : undefined
  const notBook = (f: Readonly<Record<string, unknown>>) => isOpenRole(f.folderRole) || f.folderRole === "binder"
  // フォルダ f を、エントリを中身に替えて組む（binder なら、並びのエントリの形にする）
  const made = (f: Readonly<Record<string, unknown>>, as: "book" | "binder"): unknown => {
    const lineup = Array.isArray(f.lineup) ? f.lineup : undefined
    const parts = (lineup ?? []).map((e: unknown) => {
      const r = refOf(e)
      if (r?.kind === "page") return page.get(r.id) ?? e
      const inner = r?.kind === "binder" ? folder.get(r.id) : undefined
      return inner ? made(inner, "binder") : e
    })
    const kept = rawKept.get(f)
    if (kept && sameParts(kept.parts, parts)) return kept.made
    const { folderRole: _, ...fields } = f
    const out = { ...(as === "binder" ? { kind: "binder" } : {}), ...fields, ...(lineup ? { lineup: parts } : {}) }
    rawKept.set(f, { parts, made: out })
    return out
  }
  return folders.flatMap(f => {
    if (!isObject(f)) return [f]
    return notBook(f) ? [] : [made(f, "book")]
  })
}

// ページとフォルダごとの置き直す値（id → Patch。core/patch.ts。足すなら set、無くすなら absent）
export interface RowPatches {
  pages: Readonly<Record<string, Patch>>
  folders: Readonly<Record<string, Patch>>
}

// 表 table の、patches に挙げた id の物を置き直した表（何も変わらなければ table のまま）
function patched<T>(
  table: Readonly<Record<string, T>>,
  patches: Readonly<Record<string, Patch>>,
): Readonly<Record<string, T>> {
  let next: Record<string, T> | undefined
  for (const [id, p] of Object.entries(patches)) {
    const now = table[id]
    const to = applyPatch(now, p) as T | undefined
    if (to === now) continue
    next ??= { ...table }
    if (to === undefined) delete next[id]
    else next[id] = to
  }
  return next ?? table
}

// 表 tables の、patches に挙げたページとフォルダだけを置き直した表（行ごとに当てるだけで、エントリとその中身の食い違いは直さない）
export const withRowsPatched = (tables: Library, patches: RowPatches): Library => ({
  pages: patched(tables.pages, patches.pages),
  folders: patched(tables.folders, patches.folders),
})

// 並び lineup の、has が在ると答えたエントリだけの並び（全部在れば lineup のまま）
function there<R extends AnyEntryRef>(lineup: readonly R[], has: (r: R) => boolean): readonly R[] {
  const kept = lineup.filter(has)
  return kept.length === lineup.length ? lineup : kept
}

// 表 table の行ごとに、置き直す値を今の行で確かめた、置き直す所だけの値（core/patch.ts の toPutBack）。どれかの行がぶつかれば CLASH
function toPutBackRows(
  table: Readonly<Record<string, unknown>>,
  patches: Readonly<Record<string, Patch>>,
): Record<string, Patch> | typeof CLASH {
  const out: Record<string, Patch> = {}
  for (const [id, p] of Object.entries(patches)) {
    const r = toPutBack(table[id], p)
    if (r === CLASH) return CLASH
    if (r) out[id] = r
  }
  return out
}

// 表 tables に、ページとフォルダごとの置き直す値 patches を行った表（中身が何も変わらなければ tables のまま）。置き直すのは、反対側の値のままの所だけ
// （もう置き直す側の値の所は飛ばす）。どちらの値でもない所が 1 つでも在れば null（ほかの変更とぶつかった。上から置くと、その変更を消す）。
// 無かった行を丸ごと置く値は、今 同じ中身の行が在れば済んでいるとして飛ばし、違う中身の行が在れば null。
// ページとフォルダは別々に置き直すので、行った後に、エントリとその中身が食い違う所を落とす: 中身が表に無いエントリは並びから外し、
// どのフォルダ（ブックを含む）の並びからもたどれないページとバインダは表から外す。落とすのは patches の挙げた行の中だけで、ほかの行に及ぶなら null
export function restoredTables(tables: Library, patches: RowPatches): Library | null {
  const pagesBack = toPutBackRows(tables.pages, patches.pages)
  const foldersBack = toPutBackRows(tables.folders, patches.folders)
  if (pagesBack === CLASH || foldersBack === CLASH) return null
  const pages = patched(tables.pages, pagesBack)
  const folders = patched(tables.folders, foldersBack)
  if (pages === tables.pages && folders === tables.folders) return tables
  if (placedTwice(folders, Object.keys(foldersBack))) return null
  // 書庫ホーム・フォルダ・ブックからたどれるエントリだけを残す（中身の無いエントリは、並びから外す）
  const kept: Record<string, Folder> = {}
  const reached = new Set<string>()
  const hasPage = (r: AnyEntryRef) => r.kind === "page" && pages[r.id] !== undefined
  const hasBinder = (r: AnyEntryRef) => r.kind === "binder" && folders[r.id]?.folderRole === "binder"
  // 残すエントリ r の中身をたどる: ページはたどれた物にし、バインダは、表に在るページだけの並びにして残す
  const reach = (r: AnyEntryRef) => {
    if (r.kind === "page") reached.add(r.id)
    const binder = r.kind === "binder" ? folders[r.id] : undefined
    if (binder?.folderRole !== "binder" || !Array.isArray(binder.lineup)) return
    const inner = there<PageRef>(binder.lineup, hasPage)
    kept[binder.id] = inner === binder.lineup ? binder : { ...binder, lineup: inner }
    for (const p of inner) reached.add(p.id)
  }
  for (const folder of Object.values(folders)) {
    if (folder.folderRole === "binder" || !Array.isArray(folder.lineup)) continue
    const outside = isOpenRole(folder.folderRole)
    const lineup = there<AnyEntryRef>(
      folder.lineup,
      r =>
        hasPage(r) ||
        hasBinder(r) ||
        (outside && (r.kind === "book" || (r.kind === "folder" && folders[r.id]?.folderRole === "folder"))),
    )
    kept[folder.id] = lineup === folder.lineup ? folder : ({ ...folder, lineup } as Folder)
    lineup.forEach(reach)
  }
  const sameFolders =
    Object.keys(kept).length === Object.keys(folders).length &&
    Object.entries(kept).every(([id, f]) => folders[id] === f)
  const left = Object.entries(pages).filter(([id]) => reached.has(id))
  const next = {
    pages: left.length === Object.keys(pages).length ? pages : Object.fromEntries(left),
    folders: sameFolders ? folders : kept,
  }
  // 落とすのが、置き直す値の挙げていない行（ほかの変更が動かした先の並びなど）に及ぶなら、ぶつかった
  if (touchesOthers(pages, next.pages, patches.pages) || touchesOthers(folders, next.folders, patches.folders))
    return null
  return sameRows(tables.pages, next.pages) && sameRows(tables.folders, next.folders) ? tables : next
}

// フォルダ touched の並びのエントリのどれかが、表 folders のほかのフォルダの並びにも在るか（置き直した並びが、ほかの変更が動かした先と同じエントリを持つ）
function placedTwice(folders: Folders, touched: readonly string[]): boolean {
  const lineupOf = (id: string) => {
    const lineup = folders[id]?.lineup
    return Array.isArray(lineup) ? lineup : []
  }
  const ids = new Set(touched.flatMap(id => lineupOf(id).map(r => r.id)))
  const seen = new Set<string>()
  for (const id of Object.keys(folders))
    for (const r of lineupOf(id)) {
      if (!ids.has(r.id)) continue
      if (seen.has(r.id)) return true
      seen.add(r.id)
    }
  return false
}

// 表 was から now へ変わった行に、置き直す値 patches の挙げていない行が在るか
const touchesOthers = (
  was: Readonly<Record<string, unknown>>,
  now: Readonly<Record<string, unknown>>,
  patches: Readonly<Record<string, Patch>>,
) => Object.keys(was).some(id => was[id] !== now[id] && !(id in patches))

// 表 was と now が、同じ id の行を、同じ中身で持つか
function sameRows(was: Readonly<Record<string, unknown>>, now: Readonly<Record<string, unknown>>): boolean {
  if (was === now) return true
  const ids = Object.keys(now)
  return ids.length === Object.keys(was).length && ids.every(id => was[id] === now[id] || sameData(was[id], now[id]))
}

// ブック books の表に、ページとフォルダごとの置き直す値 patches を行って組み直した一覧（変わらなかったブックは同じ値のまま。組めないブックは入らない）
export function withRowPatches(books: readonly Book[], patches: RowPatches): Readonly<Record<string, Book>> | null {
  const next = restoredTables(tablesOf(books), patches)
  return next && libraryOf(next)
}
