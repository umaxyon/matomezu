// 書庫が対象のアクションが使う、エントリの読み方と変え方: 書庫ホームかフォルダの直下に在るエントリ・名前を変える・重ならない名前にする・ゴミ箱から戻す先
import { freeTitle } from "../../../core/book"
import { type EntryKind, placeOf, titlesIn } from "../../../core/entries"
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

// エントリ entry（種類 kind）の名前（名前の無い物・書庫に無い物は undefined）
export function titleOf(library: Library, kind: EntryKind, entry: string): string | undefined {
  const row = (kind === "page" ? library.pages[entry] : library.folders[entry]) as { title?: unknown } | undefined
  return typeof row?.title === "string" && row.title !== "" ? row.title : undefined
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
  const others = titlesIn(library, { ...holder, lineup: holder.lineup.filter(r => r.id !== entry) } as Folder)
  return retitled(library, kind, entry, freeTitle(title, others))
}

// ゴミ箱から戻す先のフォルダの id: 元いたフォルダから上への列 from（近い順）のうち、今も在ってゴミ箱でもその中でもない最初のフォルダ。どれも無ければ書庫ホーム
export const restoreTargetOf = (folders: Folders, from: readonly string[]): string =>
  from.find(id => folders[id] !== undefined && folders[id].folderRole !== "trash" && !inTrash(folders, id)) ?? HOME_ID
