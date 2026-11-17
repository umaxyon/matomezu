// フォルダ（ブック・バインダを含む）の中身の並びを読む・変える計算（ここには、それだけを置く）: エントリ（ページ・バインダ・ブック・フォルダ）を、
// 別のフォルダの何番目かへ動かす・ゴミ箱に入れる・ゴミ箱から戻す。プラグインは、並びを直に組み直さず、これを通す。
// 見るのは木の形（どのフォルダが何を持てるか・自分の中へは動かせない）だけ。名前の重なり・タイプごとの決まり・ロックは、ここでは見ない

import {
  type AnyEntryRef,
  type Folder,
  type Folders,
  foldersOver,
  inTrash,
  isOpenRole,
  type Library,
  TRASH_ID,
  type TrashFolder,
  type TrashRef,
} from "./folders"

export type EntryKind = AnyEntryRef["kind"]

// エントリ entry を入れているフォルダと、その並びの中のエントリ（どこにも入っていなければ undefined。書庫ホームも）
export function placeOf(folders: Folders, entry: string): { holder: Folder; ref: AnyEntryRef } | undefined {
  const holder = foldersOver(folders, entry)[0]
  const ref = holder?.lineup.find(r => r.id === entry)
  return holder && ref ? { holder, ref } : undefined
}

// エントリ entry が、フォルダ over そのものか、その中（何段下でも）に在るか
export const isWithin = (folders: Folders, entry: string, over: string): boolean =>
  entry === over || foldersOver(folders, entry).some(f => f.id === over)

// フォルダ holder が、種類 kind のエントリを持てるか: 書庫ホーム・ゴミ箱・フォルダは 4 つとも、ブックはページとバインダ、バインダはページ
export function canHold(holder: Folder, kind: EntryKind): boolean {
  if (isOpenRole(holder.folderRole)) return true
  return kind === "page" || (kind === "binder" && holder.folderRole === "book")
}

// 動かせない訳: エントリが無い（no-entry）・先のフォルダが無い（no-folder）・先が自分かその中（into-itself）・先のフォルダが持てない種類（kind）・
// index が末尾より先（past-end）・動かしても同じ場所（same-place）・動かす物か先が、ゴミ箱かその中（in-trash。ゴミ箱へは入れる・戻すでだけ出入りする）
export type MoveRefusal = "no-entry" | "no-folder" | "into-itself" | "kind" | "past-end" | "same-place" | "in-trash"
export const isMoveRefusal = (v: Library | MoveRefusal): v is MoveRefusal => typeof v === "string"

// 書庫 library の、フォルダ puts を置き換えた（無ければ足した）書庫
const withFolders = (library: Library, puts: Readonly<Record<string, Folder>>): Library => ({
  pages: library.pages,
  folders: { ...library.folders, ...puts },
})

// エントリ entry を、フォルダ into の index 番目（動かす物を除いて数える。言わなければ末尾）へ動かした書庫。
// 同じフォルダの中の並べ替えも。動かせなければ、その訳
export function movedEntry(library: Library, entry: string, into: string, index?: number): Library | MoveRefusal {
  const { folders } = library
  const place = placeOf(folders, entry)
  if (!place) return "no-entry"
  const to = folders[into]
  if (!to) return "no-folder"
  if (to.folderRole === "trash" || inTrash(folders, entry) || inTrash(folders, into)) return "in-trash"
  if (isWithin(folders, into, entry)) return "into-itself"
  if (!canHold(to, place.ref.kind)) return "kind"
  const { holder } = place
  const ref = { kind: place.ref.kind, id: entry } as AnyEntryRef
  const others = to.lineup.filter(r => r.id !== entry)
  const at = index ?? others.length
  if (at > others.length) return "past-end"
  if (holder.id === to.id && holder.lineup.findIndex(r => r.id === entry) === at) return "same-place"
  const placed = { ...to, lineup: [...others.slice(0, at), ref, ...others.slice(at)] } as Folder
  if (holder.id === to.id) return withFolders(library, { [to.id]: placed })
  return withFolders(library, {
    [holder.id]: { ...holder, lineup: holder.lineup.filter(r => r.id !== entry) } as Folder,
    [to.id]: placed,
  })
}

// エントリ entry を、入れているフォルダから外して、ゴミ箱の末尾へ入れた書庫（入れた時刻 at と、元いたフォルダから上への id の列を、ゴミ箱の並びのエントリが持つ。
// 入れた物の行は変えない。ゴミ箱の行が無ければ作る）。エントリが無い（no-entry）か、もうゴミ箱かその中に在れば（in-trash）、その訳
export function trashedEntry(library: Library, entry: string, at: string): Library | MoveRefusal {
  const { folders } = library
  const place = placeOf(folders, entry)
  if (!place) return "no-entry"
  if (place.holder.folderRole === "trash" || inTrash(folders, entry)) return "in-trash"
  const { holder } = place
  const kept = folders[TRASH_ID]
  const trash: TrashFolder = kept?.folderRole === "trash" ? kept : { folderRole: "trash", id: TRASH_ID, lineup: [] }
  const ref = {
    kind: place.ref.kind,
    id: entry,
    trashed: at,
    from: foldersOver(folders, entry).map(f => f.id),
  } as TrashRef
  return withFolders(library, {
    [holder.id]: { ...holder, lineup: holder.lineup.filter(r => r.id !== entry) } as Folder,
    [TRASH_ID]: { ...trash, lineup: [...trash.lineup, ref] },
  })
}

// ゴミ箱の直下のエントリ entry を、フォルダ into の末尾へ戻した書庫。ゴミ箱の直下に無い（no-entry）・先のフォルダが無い（no-folder）・
// 先がゴミ箱かその中（in-trash）・先のフォルダが持てない種類（kind）なら、その訳
export function restoredEntry(library: Library, entry: string, into: string): Library | MoveRefusal {
  const { folders } = library
  const trash = folders[TRASH_ID]
  const ref = trashRefOf(folders, entry)
  if (!trash || !ref) return "no-entry"
  const to = folders[into]
  if (!to) return "no-folder"
  if (to.folderRole === "trash" || inTrash(folders, into)) return "in-trash"
  if (!canHold(to, ref.kind)) return "kind"
  const back = { kind: ref.kind, id: entry } as AnyEntryRef
  return withFolders(library, {
    [TRASH_ID]: { ...trash, lineup: trash.lineup.filter(r => r.id !== entry) } as Folder,
    [to.id]: { ...to, lineup: [...to.lineup, back] } as Folder,
  })
}

// ゴミ箱の並びのエントリ（入れた時刻と、元いたフォルダの列を持つ。入れた順）
export function trashRefsOf(folders: Folders): readonly TrashRef[] {
  const trash = folders[TRASH_ID]
  return trash?.folderRole === "trash" ? trash.lineup : []
}

// ゴミ箱の直下のエントリ entry の、ゴミ箱の並びのエントリ（無ければ undefined）
export const trashRefOf = (folders: Folders, entry: string): TrashRef | undefined =>
  trashRefsOf(folders).find(r => r.id === entry)

// 書庫が was から now に変わる間に、ゴミ箱に入った物（trashed）と、ゴミ箱から出た物（restored）の id。ゴミ箱の中の物ごと出入りした、中の物も入る。
// now に在る物だけを見る（消えた物は入らない）
export function binnedBetween(was: Library, now: Library): { trashed: string[]; restored: string[] } {
  const ids = [...Object.keys(now.pages), ...Object.keys(now.folders)]
  const here = (l: Library, id: string) => id in l.pages || id in l.folders
  return {
    trashed: ids.filter(id => inTrash(now.folders, id) && here(was, id) && !inTrash(was.folders, id)),
    restored: ids.filter(id => !inTrash(now.folders, id) && inTrash(was.folders, id)),
  }
}

// 断りの種類: 同じフォルダの中に、同じ名前の物が在る（土台が断るので、プラグインの id の名前空間は付かない）
export const TITLE_TAKEN = "title-taken"

// フォルダ folder の直下のエントリの名前（並びの順。名前の無い読めないページは入らない）
function titlesIn({ pages, folders }: Library, folder: Folder): string[] {
  return folder.lineup.flatMap(r => {
    const row = (r.kind === "page" ? pages[r.id] : folders[r.id]) as { title?: unknown } | undefined
    const title = row?.title
    return typeof title === "string" && title !== "" ? [title] : []
  })
}

// 書庫が was から now に変わる間に、直下の名前が変わって、同じ名前が重なった書庫ホーム・フォルダの id（ゴミ箱の直下は、同じ名前を許す。
// ブックとバインダの中は、ブックの決まりが見る）。前から重なっていて、名前の並びが変わらないフォルダは挙げない
export function titleClashes(was: Library, now: Library): string[] {
  return Object.values(now.folders).flatMap(f => {
    if (f.folderRole !== "home" && f.folderRole !== "folder") return []
    const titles = titlesIn(now, f)
    if (new Set(titles).size === titles.length) return []
    const before = was.folders[f.id]
    const kept = before ? titlesIn(was, before) : []
    return kept.length === titles.length && kept.every((t, i) => t === titles[i]) ? [] : [f.id]
  })
}
