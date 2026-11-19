// 書庫の画面が描く物を、書庫の表（ページの行とフォルダの行）から出す: フォルダの直下の行・ゴミ箱の行・パンくず・行を開いたときの行き先
import { type EntryKind, entriesIn, titleOf, trashRefsOf } from "../../../core/entries"
import {
  type AnyEntryRef,
  type Folders,
  foldersOver,
  HOME_ID,
  inTrash,
  type Library,
  TRASH_ID,
} from "../../../core/folders"
import { restoreTargetOf } from "./entries"

// 行 1 つ（描くのに要る物だけ）。title は名前（名前の無い物は NO_TITLE）、type はページのタイプの id（バインダなら入れるページのタイプ。無ければ NO_TYPE）、
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

// 並びのエントリ r の行
function rowOf({ pages, folders }: Library, r: AnyEntryRef): LibraryRow {
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
}

// フォルダ folder（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）の直下の行（並びの順。フォルダが無ければ空）
export function rowsIn(library: Library, folder: string): readonly LibraryRow[] {
  const entries = entriesIn(library.folders, folder)
  return entries.length === 0 ? NO_ROWS : entries.map(r => rowOf(library, r))
}

// ゴミ箱の行 1 つ: 行と、入れた時刻 trashed と、戻すと入るフォルダの id into（元いたフォルダ。戻れなければ、その上の今も在るフォルダ）と、その名前 place（名前の無い物は NO_TITLE）
export interface TrashRow extends LibraryRow {
  trashed: string
  into: string
  place: string
}

// 時刻 at（ISO）を、その環境の時刻の「2026-11-17 18:05」の形にする
export function shownDateTime(at: string): string {
  const d = new Date(at)
  const two = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

const NO_TRASH: readonly TrashRow[] = []

// ゴミ箱の直下の行（入れた時刻の新しい順。同じ時刻なら、後から入れた物が先）
export function trashRowsOf(library: Library): readonly TrashRow[] {
  const refs = trashRefsOf(library.folders)
  if (refs.length === 0) return NO_TRASH
  return refs
    .map(r => {
      const into = restoreTargetOf(library.folders, r.from)
      return { ...rowOf(library, r), trashed: r.trashed, into, place: titleOf(library, "folder", into) ?? NO_TITLE }
    })
    .reverse()
    .sort((a, b) => (a.trashed === b.trashed ? 0 : a.trashed < b.trashed ? 1 : -1))
}

// 行の中へ入れるか（右の枠にその中身を出せるか）: フォルダ・ブック・バインダで、表に在る物
export const holdsRows = (row: LibraryRow): boolean => row.kind !== "page" && row.readable

// 書庫の画面で開いているフォルダ: 値 folder のフォルダが在ればそれ、無ければ（値が無いときも）書庫ホーム。ゴミ箱の中のフォルダは開けないので、ゴミ箱
export const openedFolderOf = (folders: Folders, folder: string | undefined): string =>
  folder === undefined || !folders[folder] ? HOME_ID : inTrash(folders, folder) ? TRASH_ID : folder

// ツリーで中を出しているフォルダ: 値 unfolded が無ければ、書庫ホームだけ
const AT_FIRST: readonly string[] = [HOME_ID]
export const unfoldedOf = (unfolded: readonly string[] | undefined): readonly string[] => unfolded ?? AT_FIRST

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

export function openTargetOf(folders: Folders, row: Pick<LibraryRow, "id" | "kind" | "readable">): OpenTarget {
  if (!row.readable || row.id === TRASH_ID || inTrash(folders, row.id)) return NOT_OPENED
  if (row.kind === "folder") return { to: "folder", folder: row.id }
  if (row.kind === "book") return { to: "book", book: row.id }
  const book = foldersOver(folders, row.id).find(f => f.folderRole === "book")
  if (!book) return NOT_OPENED
  return row.kind === "page"
    ? { to: "book", book: book.id, page: row.id }
    : { to: "book", book: book.id, binder: row.id }
}

// 書庫の画面が、中身を並べて見せているフォルダ: 右の枠で開いているフォルダ opened（ゴミ箱を開いていればゴミ箱）と、ツリーで中を出しているフォルダ
// （unfolded のうち、上のフォルダが全部 unfolded に在る物。ゴミ箱の中は、ツリーに出さない）
export function shownFoldersOf(folders: Folders, opened: string, unfolded: readonly string[]): string[] {
  const open = new Set(unfolded)
  const inTree = unfolded.filter(
    id => id !== TRASH_ID && folders[id] !== undefined && foldersOver(folders, id).every(f => open.has(f.id)),
  )
  return [...new Set([opened, ...inTree])]
}

// ツリーで中を出せる行か: 中へ入れる行で、ゴミ箱でない（ゴミ箱の中は、ツリーに出さない）。holds は、中へ入れる行か
export const unfoldable = (id: string, holds: boolean): boolean => holds && id !== TRASH_ID

// 行 row（holder はそれを持つフォルダ、holds は中へ入れる行か）へ移ったときの、書庫の画面の値: 右の枠に中身を出すフォルダ folder
// （中へ入れる行なら、その行。入れない行なら、それを持つフォルダ）、選ぶ行 picked（中へ入れない行だけ）、ツリーで中を出すフォルダ unfolded（その行までの道を、今の now に足した物。足す物が無ければ now のまま）
export function arrivedAt(
  folders: Folders,
  row: { id: string; holder: string; holds: boolean },
  now: readonly string[],
): { folder: string; picked: string | undefined; unfolded: readonly string[] } {
  const folder = row.holds ? row.id : row.holder
  const over = row.holds ? pathTo(folders, folder).slice(0, -1) : pathTo(folders, folder)
  const more = over.filter(id => !now.includes(id))
  return {
    folder,
    picked: row.holds ? undefined : row.id,
    unfolded: more.length === 0 ? now : [...now, ...more],
  }
}

// ツリーに出ている行 1 つ: holder は行を持つフォルダ（一番上の行は、自分）、holds は中へ入れる行か（フォルダ・ブック・バインダで、表に在る物）、
// unfolded は中を出しているか（中を出せない行: ページ・読めない物・ゴミ箱は NOT_UNFOLDABLE）
export interface TreeRow {
  id: string
  holder: string
  holds: boolean
  unfolded: boolean | typeof NOT_UNFOLDABLE
}
export const NOT_UNFOLDABLE = "not-unfoldable"

// ツリーに出ている行（上から順）: 一番上の行（書庫ホームとゴミ箱）と、中を出しているフォルダ unfolded の下の行
export function treeRowsOf(folders: Folders, unfolded: readonly string[]): TreeRow[] {
  const open = new Set(unfolded)
  const under = (id: string, holder: string, kind: EntryKind): TreeRow[] => {
    // 一番上の行は、表に行が無くても（何も入れた事のないゴミ箱）、中へ入れる
    const holds = id === holder || (kind !== "page" && folders[id] !== undefined)
    if (!unfoldable(id, holds)) return [{ id, holder, holds, unfolded: NOT_UNFOLDABLE }]
    const shown = open.has(id)
    return [
      { id, holder, holds, unfolded: shown },
      ...(shown ? entriesIn(folders, id).flatMap(r => under(r.id, id, r.kind)) : []),
    ]
  }
  return [HOME_ID, TRASH_ID].flatMap(id => under(id, id, "folder"))
}

// ツリーで今いる行: 中へ入れない行（ページなど）を選んでいればその行、ほかは、右の枠に中身を出しているフォルダ opened
export const treeCurrentOf = (folders: Folders, opened: string, picked: string | undefined): string =>
  picked !== undefined && folders[picked] === undefined ? picked : opened
