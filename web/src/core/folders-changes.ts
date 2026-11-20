// ページとフォルダの表の変わり（TableChanges）: 前と後の表やブックから求め、表に当て、新しく足す物を引く

import { type BookRef, type Folder, isOpenRole, type Library, type TableChanges } from "./folders"
import { tablesOf } from "./folders-books"
import { REMOVED } from "./records"
import { sameData } from "./same"
import type { Book } from "./schema/book"

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
