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
  type Tables,
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
export const isMoveRefusal = (v: Readonly<Record<string, Folder>> | MoveRefusal): v is MoveRefusal =>
  typeof v === "string"

// エントリ entry を、フォルダ into の index 番目（動かす物を除いて数える。言わなければ末尾）へ動かしたときの、変わるフォルダ（id → 新しい値）。
// 同じフォルダの中の並べ替えも。動かせなければ、その訳
export function movedEntry(
  { folders }: Tables,
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
