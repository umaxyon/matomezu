// 書庫の画面のドラッグで落とす先: 落とせるか・行の間へ落とすときの位置・名前が重なるときに確かめる事を、動かすアクション（entry-move・entry-move-over）と同じ読み方で出す
import { entriesIn, isMoveRefusal, movedEntry, titleOf } from "../../../core/entries"
import type { Folders, Library } from "../../../core/folders"
import {
  freeTitleIn,
  holdsEntries,
  isNotOverwritten,
  type NotOverwritten,
  overwritten,
  placedInFolder,
  sameTitled,
} from "./entries"

// 落とす先: フォルダ into の index 番目（掴んだ物を除いて数える。言わなければ末尾）か、ゴミ箱
export type Drop = { to: "folder"; into: string; index?: number } | { to: "trash" }

// 掴める物か: エントリのアクションが扱う物（書庫ホームかフォルダの直下に在る物）
export const draggable = (folders: Folders, entry: string): boolean => placedInFolder(folders, entry) !== undefined

// エントリ entry を drop へ落とせるか（動かしても同じ場所になる所・自分の中・ブックの中へは落とせない）
export function droppable(library: Library, entry: string, drop: Drop): boolean {
  if (!draggable(library.folders, entry)) return false
  if (drop.to === "trash") return true
  return holdsEntries(library.folders, drop.into) && !isMoveRefusal(movedEntry(library, entry, drop.into, drop.index))
}

// フォルダ into の並びで、行 before の前（before が無ければ末尾）の位置を、掴んだ物 entry を除いて数えた index
export function indexBefore(folders: Folders, into: string, entry: string, before: string | undefined): number {
  const others = entriesIn(folders, into).filter(r => r.id !== entry)
  const i = before === undefined ? -1 : others.findIndex(r => r.id === before)
  return i < 0 ? others.length : i
}

// 落とす先に同じ名前の物が在るときに、利用者に確かめる事: 番号を付けた名前 numbered、上書きすると消える物の id replaces、上書きできるか overwrite（できなければ、その訳）、
// 上書きで動かすときの位置 indexOver（消える物を除いて数える）
export interface MoveClash {
  numbered: string
  replaces: string
  overwrite: "ok" | NotOverwritten
  indexOver: number | undefined
}

// 重ならなければ（同じフォルダの中の並べ替えも）undefined
export function moveClashOf(library: Library, entry: string, drop: Drop): MoveClash | undefined {
  const place = placedInFolder(library.folders, entry)
  if (!place || drop.to !== "folder" || place.holder.id === drop.into) return undefined
  const kind = place.ref.kind
  const there = sameTitled(library, kind, entry, drop.into)
  if (!there) return undefined
  const over = overwritten(library, kind, entry, drop.into, there.id)
  const at = entriesIn(library.folders, drop.into).findIndex(r => r.id === there.id)
  return {
    numbered: freeTitleIn(library, kind, entry, drop.into) ?? titleOf(library, kind, entry) ?? "",
    replaces: there.id,
    overwrite: isNotOverwritten(over) ? over : "ok",
    indexOver: drop.index === undefined ? undefined : drop.index > at ? drop.index - 1 : drop.index,
  }
}
