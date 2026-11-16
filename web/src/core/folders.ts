// ページとフォルダの表: 世界と保存の単位。ページは 1 枚ずつ、フォルダは 1 つずつ持ち、フォルダが中身（エントリ）の id を順に持つ（ページは、自分の入っているフォルダを持たない）。
// フォルダは、ブック（folderRole が "book"。エントリはページとバインダ）か、バインダ（"binder"。1 つのタイプのページだけ）。
// ブック（core/schema/book.ts の Book）は、ブックのフォルダと、その下のバインダ・ページの中身をまとめた、読む用の値。ここの関数が表から組み、変えた結果を表への書き込みに分ける
// （組むのと分けるのは、ここだけ。同じページが 2 つの値に入らないよう、持つのは表の方）

import { applyPatch, type Patch } from "./patch"
import { REMOVED } from "./records"
import { sameData } from "./same"
import type { AnyPage, BinderEntry, Book, LineupEntry } from "./schema/book"

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

// ブックのフォルダ: ブックのフィールド（名前・ロック・ゴミ箱に入れた時刻・ブックが持つ設定の項目）と、エントリの id の並び
export type BookFolder = Omit<Book, "lineup"> & { folderRole: "book"; lineup: readonly EntryRef[] }
// バインダ: 名前と、入れるページのタイプと、ページの id の並び
export interface BinderFolder {
  folderRole: "binder"
  id: string
  title: string
  pageType: string
  lineup: readonly PageRef[]
}
export type Folder = BookFolder | BinderFolder

export type Pages = Readonly<Record<string, AnyPage>>
export type Folders = Readonly<Record<string, Folder>>
// ページの表とフォルダの表
export interface Tables {
  pages: Pages
  folders: Folders
}

// 1 回のアクションが変えたページとフォルダ（id → 新しい値。無くなった物は removed）
export interface TableChanges {
  pages: Readonly<Record<string, AnyPage | typeof REMOVED>>
  folders: Readonly<Record<string, Folder | typeof REMOVED>>
}
export const NO_CHANGES: TableChanges = { pages: {}, folders: {} }

const ref = (e: { id: string }): PageRef => ({ kind: "page", id: e.id })

// 分けた物の覚え: 同じブックは、同じフォルダの値に分ける（分けて組み直すと、元のブックの値に戻る。読み直しのたびに、変わっていないブックを作り直さない）
const recordsKept = new WeakMap<Book, { folders: Folder[]; pages: AnyPage[] }>()

// ブック book を、フォルダ（ブックのフォルダと、その下のバインダ）とページに分けた物
export function recordsOf(book: Book): { folders: Folder[]; pages: AnyPage[] } {
  const kept = recordsKept.get(book)
  if (kept) return kept
  const made = split(book)
  recordsKept.set(book, made)
  return made
}

function split(book: Book): { folders: Folder[]; pages: AnyPage[] } {
  const { lineup, ...fields } = book
  const binders = lineup.flatMap(e => (e.kind === "binder" ? [e] : []))
  const own: BookFolder = {
    ...fields,
    folderRole: "book",
    lineup: lineup.map((e): EntryRef => (e.kind === "page" ? ref(e) : { kind: "binder", id: e.id })),
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
    pages: lineup.flatMap(e => (e.kind === "page" ? [e] : e.lineup)),
  }
}

// ブックの並び books を、ページの表とフォルダの表にした物
export function tablesOf(books: readonly Book[]): Tables {
  const pages: Record<string, AnyPage> = {}
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
    lineup: parts as AnyPage[],
  }
  binderKept.set(folder, { parts, made })
  return made
}

// id のブックを、表から組んだ値（ブックのフォルダが無い・バインダ・エントリが表に無ければ undefined）
export function bookOf({ pages, folders }: Tables, id: string): Book | undefined {
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
export function libraryOf(tables: Tables): Readonly<Record<string, Book>> {
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

// ページ page を入れているフォルダの列（近い順。バインダの中のページなら、バインダ → ブック。どこにも入っていなければ空）
export function foldersOver(folders: Folders, page: string): Folder[] {
  const places = placesOf(folders)
  const over: Folder[] = []
  for (let at = places.get(page); at !== undefined && over.length < 8; at = places.get(at)) {
    const folder = folders[at]
    if (!folder) break
    over.push(folder)
  }
  return over
}

// ページ page を持っているブックの id（どのブックにも入っていなければ undefined）
export const bookIdOf = (folders: Folders, page: string): string | undefined =>
  foldersOver(folders, page).find(f => f.folderRole === "book")?.id

// 行う前のブック before を、行った後のブック after にする変わり: 変わった・足したページとフォルダと、無くなったページとフォルダ（どちらにも在って中身が同じ物は入れない）。
// before と after は、1 回のアクションが受けたブックの全部と、返したブックの全部（無くなったブックは after に無い）。ページがブックの間で動いても、
// どちらかに在れば無くなったとはしない
export function changesBetween(before: readonly Book[], after: readonly Book[]): TableChanges {
  const was = tablesOf(before)
  const now = tablesOf(after)
  const changed = <T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>) => {
    const out: Record<string, T | typeof REMOVED> = {}
    for (const [id, v] of Object.entries(b)) if (a[id] !== v && !sameData(a[id], v)) out[id] = v
    for (const id of Object.keys(a)) if (!(id in b)) out[id] = REMOVED
    return out
  }
  return { pages: changed(was.pages, now.pages), folders: changed(was.folders, now.folders) }
}

// 表 next を、今の表 now に寄せる: 中身の同じページ・フォルダは今の値を使い（組んだブックも同じ値のままになり、描き直しを減らす）、全部同じなら now を返す
export function settledOn(next: Tables, now: Tables): Tables {
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
export function withChanges(tables: Tables, changes: TableChanges): Tables {
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
export function createdIn(before: readonly Book[], changes: TableChanges): string[] {
  const was = tablesOf(before)
  return [
    ...Object.entries(changes.pages).filter(([id, v]) => v !== REMOVED && !(id in was.pages)),
    ...Object.entries(changes.folders).filter(([id, v]) => v !== REMOVED && !(id in was.folders)),
  ].map(([id]) => id)
}

// 置き場所から読んだままのページとフォルダ（形を確かめる前の値）から、ブックの本文（並びにページとバインダの中身ごと持つ形）を組む。確かめるのは、組んだ後（core/book.ts の checkBooks）。
// ブックにするのは、どのフォルダのエントリにもなっていないフォルダ（形の壊れた物も、そのまま 1 冊として返す。読めないブックとして見える）。
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
  const entered = new Set(
    folders.flatMap(f => (isObject(f) && Array.isArray(f.lineup) ? f.lineup : [])).flatMap(e => refOf(e)?.id ?? []),
  )
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
    return typeof f.id === "string" && entered.has(f.id) ? [] : [made(f, "book")]
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

// 並び lineup の、has が在ると答えたエントリだけの並び（全部在れば lineup のまま）
function there<R extends EntryRef>(lineup: readonly R[], has: (r: R) => boolean): readonly R[] {
  const kept = lineup.filter(has)
  return kept.length === lineup.length ? lineup : kept
}

// 表 tables に、ページとフォルダごとの置き直す値 patches を行った表（何も変わらなければ tables のまま）。ページとフォルダは別々に置き直すので、
// 行った後に、エントリとその中身が食い違う所を落とす: 中身（ページ・バインダ）が表に無いエントリは並びから外し、どのブックの並びからもたどれないページとフォルダは表から外す
export function restoredTables(tables: Tables, patches: RowPatches): Tables {
  const pages = patched(tables.pages, patches.pages)
  const folders = patched(tables.folders, patches.folders)
  if (pages === tables.pages && folders === tables.folders) return tables
  // ブックからたどれるエントリだけを残す（中身の無いエントリは、並びから外す）
  const kept: Record<string, Folder> = {}
  const reached = new Set<string>()
  const hasPage = (r: EntryRef) => r.kind === "page" && pages[r.id] !== undefined
  for (const folder of Object.values(folders)) {
    if (folder.folderRole !== "book" || !Array.isArray(folder.lineup)) continue
    const lineup = there<EntryRef>(
      folder.lineup,
      r => hasPage(r) || (r.kind === "binder" && folders[r.id]?.folderRole === "binder"),
    )
    kept[folder.id] = lineup === folder.lineup ? folder : { ...folder, lineup }
    for (const r of lineup) {
      reached.add(r.id)
      const binder = r.kind === "binder" ? folders[r.id] : undefined
      if (binder?.folderRole !== "binder" || !Array.isArray(binder.lineup)) continue
      const inner = there<PageRef>(binder.lineup, hasPage)
      kept[binder.id] = inner === binder.lineup ? binder : { ...binder, lineup: inner }
      for (const p of inner) reached.add(p.id)
    }
  }
  const sameFolders =
    Object.keys(kept).length === Object.keys(folders).length &&
    Object.entries(kept).every(([id, f]) => folders[id] === f)
  const left = Object.entries(pages).filter(([id]) => reached.has(id))
  return {
    pages: left.length === Object.keys(pages).length ? pages : Object.fromEntries(left),
    folders: sameFolders ? folders : kept,
  }
}

// ブック books の表に、ページとフォルダごとの置き直す値 patches を行って組み直した一覧（変わらなかったブックは同じ値のまま。組めないブックは入らない）
export function withRowPatches(books: readonly Book[], patches: RowPatches): Readonly<Record<string, Book>> {
  return libraryOf(restoredTables(tablesOf(books), patches))
}
