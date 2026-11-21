// 書庫の木の形を引く・確かめる: エントリを入れているフォルダの列、ゴミ箱の中か、システムフォルダの並び、ステージエントリと、
// 木の決まり（表の treeHolds、置き場所から読んだままの行の rowsHoldTree）

import { z } from "zod"
import {
  type AnyEntryRef,
  BROKEN,
  type EntryRef,
  type Folder,
  type Folders,
  HOME_ID,
  homeAndFoldersOf,
  isOpenRole,
  isUnreadableRole,
  type Library,
  namesHomeOrFolder,
  type Pages,
  pageIn,
  TRASH_ID,
  UNREADABLE_ID,
  unreadableFolderOf,
} from "./folders"
import { recordsOf } from "./folders-books"
import type { ItemPage } from "./placed"
import type { Book } from "./schema/book"

// ブックとバインダの行から、木の決まりに要る所だけを読む形
const LooseFolderSchema = z.looseObject({
  id: z.string().min(1),
  folderRole: z.unknown().optional(),
  lineup: z.array(z.unknown()).catch([]),
})
const LooseRefSchema = z.looseObject({ kind: z.string(), id: z.string().min(1) })

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

// 書庫ホーム・ゴミ箱・フォルダのエントリ r の種類が、表の中身と合うか（表に無い物は合わない。読めない物は表に入らないので、
// 読めない物のフォルダへ移らずに残っている間は、書庫が対象のアクションを断る。表に無い物の行を消し残したり、名前の重なりを見落としたりしないため）
function refFits(pages: Pages, folders: Folders, r: AnyEntryRef): boolean {
  if (r.kind === "page") return Object.hasOwn(pages, r.id)
  return folders[r.id]?.folderRole === r.kind
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
export const pinnedCount = (folders: Folders): number => {
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

// 木の決まり: 書庫ホームが在る（ゴミ箱と読めない物のフォルダは、在れば 1 つ）／書庫ホーム・ゴミ箱・読めない物のフォルダはどのフォルダにも入らない／そのほかのフォルダは、ちょうど 1 つのフォルダに入り、
// 上へたどると書庫ホームかゴミ箱か読めない物のフォルダに着く（輪にならない）／ページは、どれかのフォルダ（ブック・バインダを含む）に入る／書庫ホーム・ゴミ箱・フォルダのエントリは、
// 種類が合う（page は表に在るページ、binder はバインダ、folder は表に在るフォルダ、book はブック）／ブックとバインダは、ブックもフォルダも持たない（型が決める）／
// システムフォルダは書庫ホームかゴミ箱の直下だけに在り、書庫ホームでは先頭に印の順に並ぶ（同じ印はゴミ箱の外に 1 つ）
export function treeHolds({ pages, folders }: Library): boolean {
  if (folders[HOME_ID]?.folderRole !== "home") return false
  const trash = folders[TRASH_ID]
  if (trash && trash.folderRole !== "trash") return false
  const unreadable = (folders as Readonly<Record<string, { folderRole: string }>>)[UNREADABLE_ID]
  if (unreadable && !isUnreadableRole(unreadable.folderRole)) return false
  const holder = new Map<string, string>()
  for (const f of Object.values(folders)) {
    for (const r of f.lineup) {
      if (holder.has(r.id)) return false
      holder.set(r.id, f.id)
      if (isOpenRole(f.folderRole) && !refFits(pages, folders, r)) return false
    }
  }
  const isTop = (id: string | undefined) => id === HOME_ID || id === TRASH_ID || id === UNREADABLE_ID
  if (holder.has(HOME_ID) || holder.has(TRASH_ID) || holder.has(UNREADABLE_ID)) return false
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
// 書庫ホーム・ゴミ箱・フォルダは形を確かめ（合わない行は入らない）、ブックとバインダは id と並びのエントリの id だけを読む（読めないブックも、行が在れば木に入る）。
// 読めない物のフォルダの中の物（移ったブックなど）が持つ物は、外のフォルダか、先に数えた中の物も持つなら、持つとは数えない（ほかのブックと id を分け合う行。W006）
export function rowsHoldTree(rows: readonly unknown[], pages: readonly string[]): boolean {
  const folders: Record<string, Folder> = {}
  for (const f of homeAndFoldersOf(rows)) folders[f.id] = f
  // 読めない物のフォルダは、中の物（並びのエントリの entry）を持つ一番上のフォルダとして木に入れる（形に合わなければ入らず、中の物が持たれていない事で破れて見える）
  const unreadable = unreadableFolderOf(rows)
  if (unreadable !== BROKEN && rows.some(r => isUnreadableRole((r as { folderRole?: unknown } | null)?.folderRole)))
    folders[UNREADABLE_ID] = { ...unreadable, lineup: unreadable.lineup.map(r => r.entry) } as unknown as Folder
  for (const row of rows) {
    if (namesHomeOrFolder(row) || isUnreadableRole((row as { folderRole?: unknown } | null)?.folderRole)) continue
    const parsed = LooseFolderSchema.safeParse(row)
    if (!parsed.success) continue
    const { id, folderRole, lineup } = parsed.data
    const refs = lineup.flatMap(r => (LooseRefSchema.safeParse(r).success ? [r as EntryRef] : []))
    folders[id] = { folderRole: folderRole === "binder" ? "binder" : "book", id, lineup: refs } as unknown as Folder
  }
  const inside = new Set<string>()
  const walk = (id: string) => {
    for (const r of folders[id]?.lineup ?? [])
      if (!inside.has(r.id)) {
        inside.add(r.id)
        walk(r.id)
      }
  }
  walk(UNREADABLE_ID)
  const heldOutside = new Set(
    Object.values(folders).flatMap(f => (f.id === UNREADABLE_ID || inside.has(f.id) ? [] : f.lineup.map(r => r.id))),
  )
  // 中の物どうしが分け合う行も、先に持つ物だけが持つとする
  const held = new Set(heldOutside)
  for (const id of inside) {
    const f = folders[id]
    if (!f) continue
    const kept = f.lineup.filter(r => !held.has(r.id))
    for (const r of kept) held.add(r.id)
    folders[id] = { ...f, lineup: kept } as Folder
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

// エントリ entry を入れているフォルダのうち、認可ステップに見せる列（近い順）: バインダとブックまで（書庫ホーム・ゴミ箱・ほかのフォルダの手前で止める。
// ブックの外のページなら、入れているバインダだけか空）
export function permissionFoldersOf(folders: Folders, entry: string): Folder[] {
  const over = foldersOver(folders, entry)
  const open = over.findIndex(f => isOpenRole(f.folderRole))
  return open < 0 ? over : over.slice(0, open)
}

// ブックの外のページ page を、そのページそのもので問うときの相手（そのページと、認可ステップに見せるフォルダの列）
export const outsideAsked = (folders: Folders, page: ItemPage): { page: ItemPage; folders: Folder[] } => ({
  page,
  folders: permissionFoldersOf(folders, page.id),
})

// ページ page を持っているブックの id（どのブックにも入っていなければ undefined）
export const bookIdOf = (folders: Folders, page: string): string | undefined =>
  foldersOver(folders, page).find(f => f.folderRole === "book")?.id

// ステージエントリが無いときの値（ステージが何も開いていない・id がステージエントリに当たらない）
export const NO_OUTERMOST = "none"

// ステージエントリ（ステージで開く単位のエントリ）: ブックか、ブックの外のページか、ブックの外のバインダ。どれも id で持つ
export interface StageEntry {
  kind: "book" | "page" | "binder"
  id: string
}
export type Outermost = StageEntry | typeof NO_OUTERMOST

// id の物のステージエントリ: ブックか、ブックの中の物ならそのブック。ブックの外のバインダか、その中のページならバインダ。ブックの外の、バインダに入っていないページならそのページ。
// フォルダ・書庫ホーム・ゴミ箱・表に無い id・どのフォルダにも入っていないページは NO_OUTERMOST。ゴミ箱の中の物も、外と同じに引く（bookIdOf と同じ）
export function outermostOf({ pages, folders }: Library, id: string): Outermost {
  const row = folders[id]
  if (row?.folderRole === "book") return { kind: "book", id }
  const over = foldersOver(folders, id)
  const book = over.find(f => f.folderRole === "book")
  if (book) return { kind: "book", id: book.id }
  if (row?.folderRole === "binder") return { kind: "binder", id }
  if (!Object.hasOwn(pages, id)) return NO_OUTERMOST
  const [near] = over
  if (!near) return NO_OUTERMOST
  return near.folderRole === "binder" ? { kind: "binder", id: near.id } : { kind: "page", id }
}

// ページ page が、ステージで開けるブックの外のページの置き場所に在るか: ブックにもバインダにも入っておらず、フォルダ（か書庫ホーム）に入っていて、ゴミ箱の中でない。
// フォルダの表だけで決める（page がページの行を持つかは見ない。持つかも確かめるのは outsidePageIn）
export function atOutsidePagePlace(folders: Folders, page: string): boolean {
  const over = foldersOver(folders, page)
  const [near] = over
  if (!near || near.folderRole === "binder" || folders[page] !== undefined) return false
  return !over.some(f => f.folderRole === "book" || f.folderRole === "trash")
}

// ステージで開ける、ブックの外のページ: id がページで、そのステージエントリがそのページ自身（ブックにもバインダにも入っていない）で、ゴミ箱の中でない。当たらなければ undefined
export function outsidePageIn(library: Library, id: string): ItemPage | undefined {
  return atOutsidePagePlace(library.folders, id) ? pageIn(library.pages, id) : undefined
}
