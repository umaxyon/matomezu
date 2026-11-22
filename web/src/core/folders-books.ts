// ブック（core/schema/book.ts の Book）は、ブックのフォルダと、その下のバインダ・ページの中身をまとめた、読む用の値。ここの関数が表から組み、変えた結果を表への書き込みに分ける
// （組むのと分けるのは、ここだけ。同じページが 2 つの値に入らないよう、持つのは表の方）

import type { BinderFolder, BookFolder, EntryRef, Folder, Folders, Library, PageRef, PageRow, Pages } from "./folders"
import { sameData } from "./same"
import type { BinderEntry, Book, LineupEntry } from "./schema/book"

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
          ...(f.settings ? { settings: f.settings } : {}),
        }
        binderKept.set(folder, { parts: f.lineup, made: f })
        return folder
      }),
    ],
    pages: lineup.flatMap((e): readonly PageRow[] => (e.kind === "binder" ? e.lineup : [e])),
  }
}

// 書庫 library のバインダ was（表から組んだエントリ）を、中のページを変えた・足した・消した・並べ替えたバインダ now に替えた書庫
// （バインダの行は並びだけを替え、was に在って now に無いページの行は消す）。バインダの行が表に無ければ、そのまま
export function withBinderEntry(library: Library, was: BinderEntry, now: BinderEntry): Library {
  const row = library.folders[was.id]
  if (row?.folderRole !== "binder" || now === was) return library
  const kept = new Set(now.lineup.map(p => p.id))
  const pages: Record<string, PageRow> = { ...library.pages }
  for (const p of was.lineup) if (!kept.has(p.id)) delete pages[p.id]
  for (const p of now.lineup) pages[p.id] = p
  const lineup = now.lineup.map(p => ({ kind: "page" as const, id: p.id }))
  return { pages, folders: { ...library.folders, [row.id]: { ...row, lineup } } }
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
export interface Kept<T> {
  parts: readonly unknown[]
  made: T
}
export const sameParts = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])
const binderKept = new WeakMap<BinderFolder, Kept<BinderEntry>>()
const bookKept = new WeakMap<BookFolder, Kept<Book>>()

// バインダ folder を、中のページごと組んだエントリ（中のページが表に 1 枚でも無ければ undefined）
export function binderEntryOf(pages: Pages, folder: BinderFolder): BinderEntry | undefined {
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
    ...(folder.settings ? { settings: folder.settings } : {}),
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
    return binder?.folderRole === "binder" ? binderEntryOf(pages, binder) : undefined
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
