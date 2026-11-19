// 書庫の画面のドラッグで落とす先: 落とせるか・行の間へ落とすときの位置・名前が重なるときに確かめる事を、動かすアクション（entry-move・entry-move-over）と同じ読み方で出す
import { entriesIn, isMoveRefusal, movedEntry, type Naming, titleOf } from "../../../core/entries"
import { type Folders, HOME_ID, type Library, pinnedCount, systemFolderOf } from "../../../core/folders"
import {
  freeTitleIn,
  isNotOverwritten,
  movesInto,
  type NotOverwritten,
  overwritten,
  placedOutsideBooks,
  placedOutsideTrash,
  sameTitled,
} from "./entries"

// 落とす先: フォルダ into の index 番目（掴んだ物を除いて数える。言わなければ末尾）か、ゴミ箱
export type Drop = { to: "folder"; into: string; index?: number } | { to: "trash" }

// 掴める物か: 動かすアクションが扱う物（ゴミ箱の外に在る物。ブックの中のページ・バインダも）。システムフォルダは動かせないので掴めない
export const draggable = (folders: Folders, entry: string): boolean =>
  placedOutsideTrash(folders, entry) !== undefined && systemFolderOf(folders[entry]) === undefined

// エントリ entry を drop へ落とせるか（動かしても同じ場所になる所・自分の中・持てない種類の所・ブックの中の物をブックの外へ、ブックの外の物をブックの中へは落とせない。
// ゴミ箱へは、書庫ホームかフォルダの直下に在る物だけ。書庫ホームの先頭のシステムフォルダより前へも落とせない）
export function droppable(library: Library, entry: string, drop: Drop): boolean {
  if (!draggable(library.folders, entry)) return false
  if (drop.to === "trash") return placedOutsideBooks(library.folders, entry) !== undefined
  if (drop.into === HOME_ID && drop.index !== undefined && drop.index < pinnedCount(library.folders)) return false
  return (
    movesInto(library.folders, entry, drop.into) && !isMoveRefusal(movedEntry(library, entry, drop.into, drop.index))
  )
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
export function moveClashOf(library: Library, entry: string, drop: Drop, naming: Naming): MoveClash | undefined {
  const place = placedOutsideTrash(library.folders, entry)
  if (!place || drop.to !== "folder" || place.holder.id === drop.into) return undefined
  const kind = place.ref.kind
  const there = sameTitled(library, kind, entry, drop.into, naming)
  if (!there) return undefined
  const over = overwritten(library, kind, entry, drop.into, there.id, naming)
  const at = entriesIn(library.folders, drop.into).findIndex(r => r.id === there.id)
  return {
    numbered: freeTitleIn(library, kind, entry, drop.into, naming) ?? titleOf(library, kind, entry, naming) ?? "",
    replaces: there.id,
    overwrite: isNotOverwritten(over) ? over : "ok",
    indexOver: drop.index === undefined ? undefined : drop.index > at ? drop.index - 1 : drop.index,
  }
}
