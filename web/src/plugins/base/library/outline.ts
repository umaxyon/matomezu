// 書庫の画面が描く物を、書庫の表（ページの行とフォルダの行）から出す: フォルダの直下の行の輪郭・パンくず・行を開いたときの行き先
import type { EntryKind } from "../../../core/entries"
import { type Folders, foldersOver, HOME_ID, inTrash, type Library, TRASH_ID } from "../../../core/folders"

// 行 1 つの輪郭。title は名前（名前の無い物は NO_TITLE）、type はページのタイプの id（バインダなら入れるページのタイプ。無ければ NO_TYPE）、
// readable は読めるか（読めないページ・表に無いブックは false）
export interface LibraryRow {
  kind: EntryKind
  id: string
  title: string
  type: string
  readable: boolean
}
export const NO_TITLE = ""
export const NO_TYPE = ""

const NO_ROWS: readonly LibraryRow[] = []

// フォルダ folder（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）の直下の行（並びの順。フォルダが無ければ空）
export function rowsIn({ pages, folders }: Library, folder: string): readonly LibraryRow[] {
  const holder = folders[folder]
  if (!holder) return NO_ROWS
  return holder.lineup.map((r): LibraryRow => {
    if (r.kind === "page") {
      const page = pages[r.id]
      return {
        kind: "page",
        id: r.id,
        title: page?.title ?? NO_TITLE,
        type: page?.type ?? NO_TYPE,
        readable: page !== undefined && page.kind !== "unreadable",
      }
    }
    const row = folders[r.id]
    const title = row && "title" in row ? row.title : NO_TITLE
    return {
      kind: r.kind,
      id: r.id,
      title,
      type: row?.folderRole === "binder" ? row.pageType : NO_TYPE,
      readable: row !== undefined,
    }
  })
}

// 行の中へ入れるか（右の枠にその中身を出せるか）: フォルダ・ブック・バインダで、表に在る物
export const holdsRows = (row: LibraryRow): boolean => row.kind !== "page" && row.readable

// 書庫の画面で開いているフォルダ: 値 folder のフォルダが在ればそれ、無ければ（値が無いときも）書庫ホーム
export const openedFolderOf = (folders: Folders, folder: string | undefined): string =>
  folder !== undefined && folders[folder] ? folder : HOME_ID

// パンくず: 一番上（書庫ホームかゴミ箱）からフォルダ folder までの、フォルダの id の列
export function pathTo(folders: Folders, folder: string): string[] {
  return [
    ...foldersOver(folders, folder)
      .map(f => f.id)
      .reverse(),
    folder,
  ]
}

// 行を開いたとき（2 回押し）の行き先: フォルダは中へ入る、ブックとその中のページ・バインダはブックを窓に出す。
// ゴミ箱の中の物・読めない物・ブックの外のページとバインダは開かない（NOT_OPENED）
export type OpenTarget =
  | { to: "folder"; folder: string }
  | { to: "book"; book: string; page?: string; binder?: string }
  | typeof NOT_OPENED
export const NOT_OPENED = "not-opened"

export function openTargetOf({ folders }: Library, row: LibraryRow): OpenTarget {
  if (!row.readable || row.id === TRASH_ID || inTrash(folders, row.id)) return NOT_OPENED
  if (row.kind === "folder") return { to: "folder", folder: row.id }
  if (row.kind === "book") return { to: "book", book: row.id }
  const book = foldersOver(folders, row.id).find(f => f.folderRole === "book")
  if (!book) return NOT_OPENED
  return row.kind === "page"
    ? { to: "book", book: book.id, page: row.id }
    : { to: "book", book: book.id, binder: row.id }
}
