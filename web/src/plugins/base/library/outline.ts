// 書庫の画面が描く物を、書庫の表（ページの行とフォルダの行）から出す: フォルダの直下の行・ゴミ箱の行・パンくず・行を開いたときの行き先
import { type EntryKind, entriesIn, type Naming, rowTitle, titleOf, trashRefsOf } from "../../../core/entries"
import {
  type AnyEntryRef,
  BROKEN,
  type Folders,
  foldersOver,
  HOME_ID,
  inTrash,
  type Library,
  type MovedCode,
  TRASH_ID,
  type TrashRef,
  UNREADABLE_ID,
  type UnreadableItem,
  type UnreadableRef,
} from "../../../core/folders"
import type { MovedIfOff } from "../../../core/unreadable"
import { restoreTargetOf } from "./entries"

// 行 1 つ（描くのに要る物だけ）。title は名前（名前の無い物は NO_TITLE）、type はページのタイプの id（バインダなら入れるページのタイプ。無ければ NO_TYPE）、
// readable は読めるか（表に無い物は false）
export interface LibraryRow {
  kind: EntryKind
  id: string
  title: string
  type: string
  readable: boolean
  locked: boolean // ロック中のページかブック
}
export const NO_TITLE = ""
export const NO_TYPE = ""

const NO_ROWS: readonly LibraryRow[] = []

// 並びのエントリ r の行（名前は naming で引く）
function rowOf(library: Library, r: AnyEntryRef, naming: Naming): LibraryRow {
  const { pages, folders } = library
  const title = titleOf(library, r.kind, r.id, naming) ?? NO_TITLE
  if (r.kind === "page") {
    const page = pages[r.id]
    return {
      kind: "page",
      id: r.id,
      title,
      type: page?.type ?? NO_TYPE,
      readable: page !== undefined,
      locked: page?.locked === true,
    }
  }
  const row = folders[r.id]
  return {
    kind: r.kind,
    id: r.id,
    title,
    type: row?.folderRole === "binder" ? row.pageType : NO_TYPE,
    readable: row !== undefined,
    locked: row?.folderRole === "book" && row.locked === true,
  }
}

// フォルダ folder（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）の直下の行（並びの順。フォルダが無ければ空）
export function rowsIn(library: Library, folder: string, naming: Naming): readonly LibraryRow[] {
  const entries = entriesIn(library.folders, folder)
  return entries.length === 0 ? NO_ROWS : entries.map(r => rowOf(library, r, naming))
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
export function trashRowsOf(library: Library, naming: Naming): readonly TrashRow[] {
  const refs = trashRefsOf(library.folders)
  if (refs.length === 0) return NO_TRASH
  return trashOrder(refs).map(r => {
    const into = restoreTargetOf(library.folders, r.from)
    const place = titleOf(library, "folder", into, naming) ?? NO_TITLE
    return { ...rowOf(library, r, naming), trashed: r.trashed, into, place }
  })
}

// 時刻 at の新しい順に並べ替えた items（同じ時刻なら、並びの後ろの物が先）
function newestFirst<T>(items: readonly T[], at: (item: T) => string): T[] {
  return [...items].reverse().sort((a, b) => (at(a) === at(b) ? 0 : at(a) < at(b) ? 1 : -1))
}

// ゴミ箱の並び refs の、見せる順（入れた時刻の新しい順）
const trashOrder = (refs: readonly TrashRef[]): readonly TrashRef[] => newestFirst(refs, r => r.trashed)

// 読めない物のフォルダの直下の物 items の、見せる順（形に合う物を移った時刻の新しい順、そのあと形に合わない物を並びの順）
function unreadableOrder(items: readonly UnreadableItem[]): readonly UnreadableItem[] {
  const fits = items.filter((i): i is UnreadableItem & { ref: UnreadableRef } => i.ref !== BROKEN)
  return [...newestFirst(fits, i => i.ref.moved), ...items.filter(i => i.ref === BROKEN)]
}

// 書庫の画面の右の枠が見せている行の id（見せる順）: 開いているフォルダ opened がゴミ箱・読めない物のフォルダ（直下の物 unreadable）なら、その一覧の順、ほかは並びの順。
// ビューと、右の枠で行を選ぶコマンドが、同じ順を使う
export function paneIdsOf(folders: Folders, unreadable: readonly UnreadableItem[], opened: string): readonly string[] {
  if (opened === TRASH_ID) return trashOrder(trashRefsOf(folders)).map(r => r.id)
  if (opened === UNREADABLE_ID) return unreadableOrder(unreadable).map(i => i.id)
  return entriesIn(folders, opened).map(r => r.id)
}

// 読めない物の行 1 つ: 読めない物のフォルダの直下の物の id と名前 title。並びの要素が形に合えば（fits）、種類 kind・在った所 place・訳の番号 code・
// 無いタイプ type（W027 のとき。無ければ NO_TYPE）・移った時刻 moved も持つ。形に合わなければ（BROKEN）名前だけ
export type UnreadableRow =
  | {
      shape: "fits"
      id: string
      title: string
      kind: EntryKind
      place: UnreadablePlace
      code: MovedCode
      type: string
      moved: string
    }
  | { shape: typeof BROKEN; id: string; title: string }
// 読めない物が在った所: そのフォルダかブックの id・名前 title（名前の無い物は NO_TITLE）・ブックか trash（ゴミ箱に居た物なら true。id は、ゴミ箱に入れる前に居た所）
export interface UnreadablePlace {
  id: string
  title: string
  book: boolean
  trash: boolean
}

const NO_UNREADABLE: readonly UnreadableRow[] = []

// 読めない物が在った所の id: from は、その物を並びに持つフォルダから上へのフォルダの id の列（空なら書庫ホーム）。
// 直近がブックの中のバインダなら、そのブック。roleOf は、フォルダの id の役（folderRole）を引く
export function placeIdOf(from: readonly string[], roleOf: (id: string) => unknown): string {
  const [near = HOME_ID, next] = from
  return roleOf(near) === "binder" && next !== undefined && roleOf(next) === "book" ? next : near
}

// 追加プラグインを無効にしたら移る物 moved が在る所ごとの数（在る所の名前 title。名前の無い物は NO_TITLE。在る所が最初に出た順）。
// book は在る所がブックか、pages は数えた物がどれもページか
export interface MovedPlace {
  id: string
  title: string
  book: boolean
  count: number
  pages: boolean
}
export function movedPlacesOf(moved: readonly MovedIfOff[], library: Library, naming: Naming): readonly MovedPlace[] {
  const roleOf = (id: string): unknown => library.folders[id]?.folderRole
  const placeOfHolder = new Map<string, string>()
  const places = new Map<string, MovedPlace>()
  for (const m of moved) {
    const id =
      placeOfHolder.get(m.holder) ??
      placeIdOf([m.holder, ...foldersOver(library.folders, m.holder).map(f => f.id)], roleOf)
    placeOfHolder.set(m.holder, id)
    const was = places.get(id)
    const title = was?.title ?? titleOf(library, "folder", id, naming) ?? NO_TITLE
    const book = roleOf(id) === "book"
    places.set(id, { id, title, book, count: (was?.count ?? 0) + 1, pages: (was?.pages ?? true) && m.kind === "page" })
  }
  return [...places.values()]
}

// 読めない物のフォルダの直下の物 items の行（移った時刻の新しい順。同じ時刻なら、後から移った物が先。形に合わない物は最後に並びの順）。
// 在った所は、書庫の表 library に在ればそこから、無ければ（そのブックもあとから移った）読めない物のフォルダの直下の物の行から名前を引く。
// バインダの中に居たページは、そのバインダを持つブックを在った所とする（ブックの外のバインダなら、そのバインダ）
export function unreadableRowsOf(
  items: readonly UnreadableItem[],
  library: Library,
  naming: Naming,
): readonly UnreadableRow[] {
  if (items.length === 0) return NO_UNREADABLE
  const moved = new Map(items.map(i => [i.id, i.row]))
  const roleOf = (id: string): unknown =>
    library.folders[id]?.folderRole ?? (moved.get(id) as { folderRole?: unknown } | undefined)?.folderRole
  const placeOf = (from: readonly string[], trash: boolean): UnreadablePlace => {
    const id = placeIdOf(from, roleOf)
    const title = titleOf(library, "folder", id, naming) ?? rowTitle(moved.get(id), "book", naming) ?? NO_TITLE
    return { id, title, book: roleOf(id) === "book", trash }
  }
  return unreadableOrder(items).map((item): UnreadableRow => {
    if (item.ref === BROKEN)
      return { shape: BROKEN, id: item.id, title: rowTitle(item.row, "page", naming) ?? NO_TITLE }
    const { entry, from, code, type, moved: at } = item.ref
    const trashed = "trashed" in entry
    return {
      shape: "fits",
      id: item.id,
      title: rowTitle(item.row, entry.kind, naming) ?? NO_TITLE,
      kind: entry.kind,
      place: placeOf(trashed ? entry.from : from, trashed),
      code,
      type: type ?? NO_TYPE,
      moved: at,
    }
  })
}

// 行の中へ入れるか（右の枠にその中身を出せるか）: フォルダ・ブック・バインダで、表に在る物
export const holdsRows = (row: LibraryRow): boolean => row.kind !== "page" && row.readable

// 書庫の画面で開いているフォルダ: 値 folder のフォルダが在ればそれ、無ければ（値が無いときも）書庫ホーム。ゴミ箱の中のフォルダは開けないので、ゴミ箱。
// 読めない物のフォルダは、書庫の表に無くても開ける（ツリーに出していなくても、ツリーの下の「⚠ 読めない物」から開く）
export const openedFolderOf = (folders: Folders, folder: string | undefined): string =>
  folder === UNREADABLE_ID
    ? UNREADABLE_ID
    : folder === undefined || !folders[folder]
      ? HOME_ID
      : inTrash(folders, folder)
        ? TRASH_ID
        : folder

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
export const unfoldable = (id: string, holds: boolean): boolean => holds && id !== TRASH_ID && id !== UNREADABLE_ID

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

// ツリーの一番上に並ぶ行の id: 書庫ホームとゴミ箱と、読めない物のフォルダを出す設定 unreadableShown がオンなら読めない物のフォルダ
const TOP_IDS: readonly string[] = [HOME_ID, TRASH_ID]
const TOP_IDS_WITH_UNREADABLE: readonly string[] = [...TOP_IDS, UNREADABLE_ID]
export const topIdsOf = (unreadableShown: boolean): readonly string[] =>
  unreadableShown ? TOP_IDS_WITH_UNREADABLE : TOP_IDS

// ツリーに出ている行（上から順）: 一番上の行（topIdsOf）と、中を出しているフォルダ unfolded の下の行
export function treeRowsOf(folders: Folders, unfolded: readonly string[], unreadableShown: boolean): TreeRow[] {
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
  return topIdsOf(unreadableShown).flatMap(id => under(id, id, "folder"))
}

// 行の並び ids のうち、Tab で止まる行: 止めたい行 want が並びに在ればそれ、無ければ fallback（言わなければ最初の行。並びが空なら undefined）
export function tabStopOf(ids: readonly string[], want: string | undefined, fallback = ids[0]): string | undefined {
  return want !== undefined && ids.includes(want) ? want : fallback
}

// ツリーで今いる行: 中へ入れない行（ページなど）を選んでいればその行、ほかは、右の枠に中身を出しているフォルダ opened
export const treeCurrentOf = (folders: Folders, opened: string, picked: string | undefined): string =>
  picked !== undefined && folders[picked] === undefined ? picked : opened
