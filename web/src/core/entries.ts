// 書庫の木を変える計算: エントリ（ページ・バインダ・ブック・フォルダ）を、別のフォルダ（ブック・バインダを含む）の何番目かへ動かす。
// 見るのは木の形（どのフォルダが何を持てるか・自分の中へは動かせない）だけ。名前の重なり・タイプごとの決まり・ロックは、ここでは見ない

import {
  type AnyEntryRef,
  type Folder,
  type Folders,
  foldersOver,
  HOME_ID,
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
export const isMoveRefusal = (v: object | MoveRefusal): v is MoveRefusal => typeof v === "string"

// エントリ entry を、フォルダ into の index 番目（動かす物を除いて数える。言わなければ末尾）へ動かしたときの、変わるフォルダ（id → 新しい値）。
// 同じフォルダの中の並べ替えも。動かせなければ、その訳
export function movedEntry(
  { folders }: Library,
  entry: string,
  into: string,
  index?: number,
): Readonly<Record<string, Folder>> | MoveRefusal {
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
  if (holder.id === to.id) return { [to.id]: placed }
  return { [holder.id]: { ...holder, lineup: holder.lineup.filter(r => r.id !== entry) } as Folder, [to.id]: placed }
}

// ゴミ箱から戻す先のフォルダの id: 元いたフォルダから上への列 from（近い順）のうち、今も在ってゴミ箱の中でない最初のフォルダ。どれも無ければ書庫ホーム
export const restoreTargetOf = (folders: Folders, from: readonly string[]): string =>
  from.find(id => folders[id] !== undefined && folders[id].folderRole !== "trash" && !inTrash(folders, id)) ?? HOME_ID

// 書庫 library の、フォルダ puts を置き換えた（無ければ足した）書庫
const withFolders = (library: Library, puts: Readonly<Record<string, Folder>>): Library => ({
  pages: library.pages,
  folders: { ...library.folders, ...puts },
})

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
  const ref = trash?.folderRole === "trash" ? trash.lineup.find(r => r.id === entry) : undefined
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

// ゴミ箱の直下のエントリ entry の、ゴミ箱の並びのエントリ（入れた時刻と、元いたフォルダの列を持つ。無ければ undefined）
export function trashRefOf(folders: Folders, entry: string): TrashRef | undefined {
  const trash = folders[TRASH_ID]
  return trash?.folderRole === "trash" ? trash.lineup.find(r => r.id === entry) : undefined
}
