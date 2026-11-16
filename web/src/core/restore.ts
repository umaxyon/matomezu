// ページとフォルダごとの置き直し: 画面の履歴の段が変えたページ・フォルダごとの置き直す値（core/patch.ts の Patch）を、今の表（core/folders.ts）の上で行う。
// ページとフォルダは別々に置き直すので、行った後に、エントリとその中身が食い違う所を落とす（その間にほかでフォルダが無くなった・ページが足されたなど）:
// 中身（ページ・バインダ）が表に無いエントリは並びから外し、どのブックの並びからもたどれないページとフォルダは表から外す
import { bookOf, type EntryRef, type Folder, type PageRef, type Tables, tablesOf } from "./folders"
import type { Library } from "./library"
import { applyPatch, type Patch, patchOf } from "./patch"

// ページとフォルダごとの置き直す値（id → Patch。足すなら set、無くすなら absent）
export interface RowPatches {
  pages: Readonly<Record<string, Patch>>
  folders: Readonly<Record<string, Patch>>
}

// ページ・フォルダ 1 つの、変わる前と後（無いときは "none"）
export interface RowChange<T> {
  before: T | "none"
  after: T | "none"
}

// 変わる前後の表 rows を、to の側（"before" なら前、"after" なら後）へ置き直す値（どちらの側も同じ物は入れない）
export function patchesToward<T>(
  rows: Readonly<Record<string, RowChange<T>>>,
  to: "before" | "after",
): Record<string, Patch> {
  const from = to === "before" ? "after" : "before"
  const value = (v: T | "none") => (v === "none" ? undefined : v)
  const out: Record<string, Patch> = {}
  for (const [id, row] of Object.entries(rows)) {
    const p = patchOf(value(row[from]), value(row[to]))
    if (p) out[id] = p
  }
  return out
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

// 表 tables に、ページとフォルダごとの置き直す値 patches を行った表（何も変わらなければ tables のまま）
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

// 一覧 library のブック books を、ページとフォルダごとの置き直す値 patches で置き直した一覧（変わらなかったブックは同じ値のまま）。
// books のどれかが無い・ゴミ箱に在る・置き直すと組めなくなるか、books のほかのブックが変わる・ブックが増える・減るなら null
export function restoredLibrary(library: Library, books: readonly string[], patches: RowPatches): Library | null {
  if (books.some(id => library[id] === undefined || library[id]?.trashed !== undefined)) return null
  const tables = restoredTables(tablesOf(Object.values(library)), patches)
  if (Object.values(tables.folders).filter(f => f.folderRole === "book").length !== Object.keys(library).length)
    return null
  const next: Record<string, Library[string]> = {}
  for (const was of Object.values(library)) {
    const now = bookOf(tables, was.id)
    if (!now || (now !== was && !books.includes(was.id))) return null
    next[was.id] = now
  }
  return next
}
