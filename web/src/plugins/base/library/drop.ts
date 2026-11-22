// 書庫の画面のドラッグで落とす先: 落とせるか・行の間へ落とすときの位置・名前が重なるときに確かめる事を、動かすアクション（entry-move・entry-move-over）と同じ読み方で出す
import { outsideHolds } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import {
  carriedEntry,
  entriesIn,
  isMoveRefusal,
  movedWithBinders,
  type Naming,
  NEW_BINDER,
  namingIn,
  placeOf,
  titleOf,
} from "../../../core/entries"
import type { AnyEntryRef, Folders, Library } from "../../../core/folders"
import { systemFolderOf, treeHolds } from "../../../core/folders-tree"
import { losesOutermostSettings } from "../../../core/perform-library"
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

// 落とせるかを読むときに、作るバインダに振る id の頭（読むだけで、書庫には残さない）。振るのは、頭に 0 から順の番号を足した id（書庫に在る id と重なれば、次の番号）
const DROP_CHECK_BINDER_ID = "library-drop"
const dropCheckIds = (): (() => string) => {
  let n = 0
  return () => `${DROP_CHECK_BINDER_ID}-${n++}`
}

// エントリ entry を drop へ落とせるか（動かしても同じ場所になる所・自分の中・持てない種類の所と、動かすアクションが扱わない所 movesInto へは落とせない。
// ゴミ箱へは、書庫ホームかフォルダの直下に在る物だけ。動かした書庫（entry-move と同じ movedWithBinders）が木の決まり treeHolds とブックの外の決まり outsideHolds を破る所
// （書庫ホームの先頭のシステムフォルダより前など）へも落とせない）
export function droppable(catalog: CoreCatalog, library: Library, entry: string, drop: Drop): boolean {
  if (!draggable(library.folders, entry)) return false
  if (drop.to === "trash") return placedOutsideBooks(library.folders, entry) !== undefined
  if (!movesInto(catalog, library, entry, drop.into)) return false
  const naming = namingIn(catalog, "en")
  const moved = movedWithBinders(catalog, library, entry, drop.into, drop.index, naming, dropCheckIds())
  return !isMoveRefusal(moved) && treeHolds(moved.next) && outsideHolds(catalog, library, moved.next)
}

// フォルダ into の並びで、行 before の前（before が無ければ末尾）の位置を、掴んだ物 entry を落としたときに into へ入る物（carriedEntry）を除いて数えた index
export function indexBefore(
  catalog: CoreCatalog,
  library: Library,
  into: string,
  entry: string,
  before: string | undefined,
): number {
  const carried = carriedEntry(catalog, library, entry, into)
  const moving = carried === undefined || carried === NEW_BINDER ? entry : carried.id
  const others = entriesIn(library.folders, into).filter(r => r.id !== moving)
  const i = before === undefined ? -1 : others.findIndex(r => r.id === before)
  return i < 0 ? others.length : i
}

// entry を drop へ動かすと、ステージエントリが持つ設定の項目の値（印刷プレビューの設定など）が消えるか（動かせない移動なら false）
export function clearsOutermostSettings(library: Library, entry: string, drop: Drop, naming: Naming): boolean {
  if (drop.to !== "folder") return false
  const moved = movedWithBinders(naming.catalog, library, entry, drop.into, drop.index, naming, dropCheckIds())
  return !isMoveRefusal(moved) && losesOutermostSettings(naming.catalog, library, moved.next)
}

// 落とす先に同じ名前の物が在るときに、利用者に確かめる事: 落とす先へ入る物 carried（carriedEntry。名前が重なっている物）、番号を付けた名前 numbered、
// 上書きすると消える物の id replaces、上書きできるか overwrite（できなければ、その訳）、上書きで動かすときの位置 indexOver（消える物を除いて数える）
export interface MoveClash {
  carried: AnyEntryRef
  numbered: string
  replaces: string
  overwrite: "ok" | NotOverwritten
  indexOver: number | undefined
}

// 重なりを見るのは、落とす先へ入る物（carriedEntry。ブックの外の、中がそのページだけのバインダから、まとまるタイプのページを出すなら、そのバインダ）。
// 重ならなければ（同じフォルダの中の並べ替えも）・バインダを作る移動なら（名前に番号を付けるので確かめない）undefined
export function moveClashOf(library: Library, entry: string, drop: Drop, naming: Naming): MoveClash | undefined {
  if (!placedOutsideTrash(library.folders, entry) || drop.to !== "folder") return undefined
  const carried = carriedEntry(naming.catalog, library, entry, drop.into)
  if (!carried || carried === NEW_BINDER || placeOf(library.folders, carried.id)?.holder.id === drop.into)
    return undefined
  const { kind, id } = carried
  const there = sameTitled(library, kind, id, drop.into, naming)
  if (!there) return undefined
  const over = overwritten(library, kind, id, drop.into, there.id, naming)
  const at = entriesIn(library.folders, drop.into).findIndex(r => r.id === there.id)
  return {
    carried,
    numbered: freeTitleIn(library, kind, id, drop.into, naming) ?? titleOf(library, kind, id, naming) ?? "",
    replaces: there.id,
    overwrite: isNotOverwritten(over) ? over : "ok",
    indexOver: drop.index === undefined ? undefined : drop.index > at ? drop.index - 1 : drop.index,
  }
}
