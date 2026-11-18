// 書庫が対象のアクションが使う、エントリの読み方と変え方: 書庫ホームかフォルダの直下に在るエントリ・名前を変える・重ならない名前にする・ゴミ箱から戻す先
import { freeTitle } from "../../../core/book"
import {
  type EntryKind,
  isMoveRefusal,
  isWithin,
  placeOf,
  removedEntry,
  rowsWithin,
  titledIn,
  titleOf,
  titlesIn,
} from "../../../core/entries"
import {
  type AnyEntryRef,
  type Folder,
  type Folders,
  HOME_ID,
  type HomeOrFolder,
  inTrash,
  type Library,
  type PageRow,
} from "../../../core/folders"

// 書庫ホームかフォルダの直下に在る（ゴミ箱の中でない）エントリ entry の、入れているフォルダと並びのエントリ。
// ブック・バインダの中の物、ゴミ箱かその中の物、どこにも入っていない物（書庫ホーム・ゴミ箱）は undefined
export function placedInFolder(
  folders: Folders,
  entry: string,
): { holder: Exclude<HomeOrFolder, { folderRole: "trash" }>; ref: AnyEntryRef } | undefined {
  const place = placeOf(folders, entry)
  if (!place) return undefined
  const { holder, ref } = place
  if (holder.folderRole !== "home" && holder.folderRole !== "folder") return undefined
  return inTrash(folders, entry) ? undefined : { holder, ref }
}

// エントリを入れられるフォルダか: 書庫ホームかフォルダで、ゴミ箱の中でない
export const holdsEntries = (folders: Folders, id: string): boolean => {
  const f = folders[id]
  return (f?.folderRole === "home" || f?.folderRole === "folder") && !inTrash(folders, id)
}

// エントリ entry（種類 kind）の名前を title にした書庫（名前を持たない物・書庫に無い物は null。同じ名前なら library のまま）
export function retitled(library: Library, kind: EntryKind, entry: string, title: string): Library | null {
  const now = titleOf(library, kind, entry)
  if (now === undefined) return null
  if (now === title) return library
  if (kind === "page")
    return {
      pages: { ...library.pages, [entry]: { ...library.pages[entry], title } as PageRow },
      folders: library.folders,
    }
  return {
    pages: library.pages,
    folders: { ...library.folders, [entry]: { ...library.folders[entry], title } as Folder },
  }
}

// フォルダ into の直下に在るエントリ entry（種類 kind）の名前が、同じフォルダのほかの物と重なっていれば、番号を付けた名前（「名前 2」から）にした書庫。重ならなければ library のまま
export function numbered(library: Library, kind: EntryKind, entry: string, into: string): Library | null {
  const holder = library.folders[into]
  const title = titleOf(library, kind, entry)
  if (!holder || title === undefined) return null
  return retitled(library, kind, entry, freeTitle(title, titlesIn(library, holder, entry)))
}

// ゴミ箱から戻す先のフォルダの id: 元いたフォルダから上への列 from（近い順）のうち、今も在ってゴミ箱でもその中でもない最初のフォルダ。どれも無ければ書庫ホーム
export const restoreTargetOf = (folders: Folders, from: readonly string[]): string =>
  from.find(id => folders[id] !== undefined && folders[id].folderRole !== "trash" && !inTrash(folders, id)) ?? HOME_ID

// フォルダ into の直下で、エントリ entry（種類 kind）と同じ名前を持つ、ほかのエントリ（無ければ undefined）
export function sameTitled(library: Library, kind: EntryKind, entry: string, into: string): AnyEntryRef | undefined {
  const title = titleOf(library, kind, entry)
  const holder = library.folders[into]
  return title === undefined || !holder ? undefined : titledIn(library, holder, title, entry)
}

// 上書き: フォルダ into の直下の、エントリ entry（種類 kind）と同じ名前の物を、中身ごと書庫から消した書庫（ゴミ箱には入れない。同じ名前の物が無ければ library のまま）。
// 上書きできなければ null: 種類が違う・前から在った方の中に entry が在る・前から在った方かその中に読めないページが在る
// （ロックした物は、認可ステップが行った後の確かめで止める）
export function overwritten(library: Library, kind: EntryKind, entry: string, into: string): Library | null {
  const there = sameTitled(library, kind, entry, into)
  if (!there) return library
  if (there.kind !== kind || isWithin(library.folders, entry, there.id)) return null
  const pages = there.kind === "page" ? [there.id] : rowsWithin(library.folders, there.id).pages
  if (pages.some(p => library.pages[p]?.kind === "unreadable")) return null
  const next = removedEntry(library, there.id)
  return isMoveRefusal(next) ? null : next
}
