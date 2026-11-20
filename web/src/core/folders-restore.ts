// ページとフォルダの表を、行ごとの置き直す値（core/patch.ts の Patch）で置き直す: ほかの変更とぶつかれば断り、行った後にエントリとその中身の食い違いを落とす

import { type AnyEntryRef, type Folder, type Folders, isOpenRole, type Library, type PageRef } from "./folders"
import { applyPatch, CLASH, type Patch, toPutBack } from "./patch"
import { sameData } from "./same"

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
