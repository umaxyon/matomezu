// 書庫の画面が描く物を、書庫の表（ページの行とフォルダの行）から出す: フォルダの直下の行・ゴミ箱の行・パンくず・行を開いたときの行き先
import {
  type EntryKind,
  entriesIn,
  type Naming,
  placeOf,
  rowsWithin,
  rowTitle,
  titleOf,
  trashRefsOf,
} from "../../../core/entries"
import {
  type AnyEntryRef,
  BROKEN,
  type Folder,
  type Folders,
  HOME_ID,
  type Library,
  type MovedCode,
  TRASH_ID,
  type TrashRef,
  UNREADABLE_ID,
  type UnreadableRef,
} from "../../../core/folders"
import { atOutsidePagePlace, foldersOver, inTrash, systemFolderOf } from "../../../core/folders-tree"
import type { UnreadableItem } from "../../../core/folders-unreadable"
import {
  bookOfReference,
  holdsNewReference,
  referableIn,
  referableTarget,
  referenceLook,
} from "../../../core/references"
import type { ReferenceEntry } from "../../../core/schema/book"
import type { MovedIfOff } from "../../../core/unreadable"
import type { Workdesk } from "../participant/workdesks"
import { restoreTargetOf } from "./entries"
import { WORKROOMS } from "./system-folders"
import {
  type DeskPlace,
  deskBookRowId,
  deskEntryRowId,
  deskPathOf,
  deskPlaceOf,
  deskRowId,
  GONE,
  isDeskRow,
  NO_DESKS,
  realOf,
  workroomsFolderOf,
} from "./workdesk-rows"

// 行 1 つ（描くのに要る物だけ）。title は名前（名前の無い物は NO_TITLE）、type はページのタイプの id（バインダなら入れるページのタイプ。無ければ NO_TYPE）、
// readable は読めるか（表に無い物は false）。参照エントリの行（kind が reference。ブックの中身にだけ出る）は、id が参照エントリの id、名前とタイプが指す先の物
// （指す先の行が無ければ NO_TITLE）
export type RowKind = EntryKind | "reference"
export interface LibraryRow {
  kind: RowKind
  id: string
  title: string
  type: string
  readable: boolean
  locked: boolean // ロック中のページかブック
  desk?: { bird: string; palette: string } // 作業机の行: そのワークルームの鳥と配色
  nothingIn?: true // 作業机の下の、中に出す物も開く物も無い行（実のブックがまだ無いワーカーブック）。薄くしない
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

// ブックの並びの参照エントリ r の行
function referenceRowOf(library: Library, r: ReferenceEntry): LibraryRow {
  const look = referenceLook(library, r)
  return {
    kind: "reference",
    id: r.id,
    title: look?.title ?? NO_TITLE,
    type: look?.type ?? NO_TYPE,
    readable: true,
    locked: false,
  }
}

// フォルダ folder（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ。作業机とその下の行も）の直下の行（並びの順。フォルダが無ければ空）。
// ワークルームのフォルダの直下は、作業机 desks
export function rowsIn(
  library: Library,
  folder: string,
  naming: Naming,
  desks: readonly Workdesk[],
): readonly LibraryRow[] {
  const under = childrenOf(library.folders, folder, desks)
  if (under === undefined) {
    const holder = library.folders[folder]
    if (holder?.folderRole === "book" && holder.lineup.some(r => r.kind === "reference"))
      return holder.lineup.map(r => (r.kind === "reference" ? referenceRowOf(library, r) : rowOf(library, r, naming)))
    const entries = entriesIn(library.folders, folder)
    return entries.length === 0 ? NO_ROWS : entries.map(r => rowOf(library, r, naming))
  }
  return under.length === 0 ? NO_ROWS : under.map(c => c.row(library, naming))
}

// 作業机とその下の行 1 つ: id と種類と、中へ入れるか holds、描く行 row
interface DeskChild {
  id: string
  kind: EntryKind
  holds: boolean
  row(library: Library, naming: Naming): LibraryRow
}

// フォルダ folder の直下の、作業机とその下の行（ワークルームのフォルダなら作業机、作業机とその下の行なら、その下の行）。ほかのフォルダなら undefined
function childrenOf(folders: Folders, folder: string, desks: readonly Workdesk[]): readonly DeskChild[] | undefined {
  if (systemFolderOf(folders[folder]) === WORKROOMS.id) return desks.map(deskChild)
  const place = deskPlaceOf(desks, folders, folder)
  if (place === undefined) return undefined
  if (place === GONE) return []
  if (place.at === "desk") return [bookChild(place.desk)]
  const real = place.real
  if (real === undefined || place.id !== folder) return []
  return entriesIn(folders, real).map(r => ({
    id: deskEntryRowId(place.desk.room, r.id),
    kind: r.kind,
    holds: r.kind !== "page" && folders[r.id] !== undefined,
    row: (library, naming) => ({ ...rowOf(library, r, naming), id: deskEntryRowId(place.desk.room, r.id) }),
  }))
}

const deskChild = (desk: Workdesk): DeskChild => ({
  id: deskRowId(desk.room),
  kind: "folder",
  holds: true,
  row: () => ({
    kind: "folder",
    id: deskRowId(desk.room),
    title: desk.title,
    type: NO_TYPE,
    readable: true,
    locked: false,
    desk: { bird: desk.bird, palette: desk.palette },
  }),
})

const bookChild = (desk: Workdesk): DeskChild => ({
  id: deskBookRowId(desk.room),
  kind: "book",
  holds: desk.book !== undefined,
  row: (library, naming) => ({
    kind: "book",
    id: deskBookRowId(desk.room),
    title: (desk.book && titleOf(library, "book", desk.book, naming)) || desk.bookTitle,
    type: NO_TYPE,
    readable: true,
    locked: false,
    ...(desk.book === undefined ? { nothingIn: true as const } : {}),
  }),
})

// 作業机とその下の行 place が、中へ入れる行か
const deskHolds = (folders: Folders, place: DeskPlace): boolean =>
  place.at === "desk" ? true : place.at === "book" ? place.real !== undefined : folders[place.real] !== undefined

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
  return trashNewestFirst(refs).map(r => {
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
const trashNewestFirst = (refs: readonly TrashRef[]): readonly TrashRef[] => newestFirst(refs, r => r.trashed)

// 読めない物のフォルダの直下の物 items の、見せる順（形に合う物を移った時刻の新しい順、そのあと形に合わない物を並びの順）
function unreadableOrder(items: readonly UnreadableItem[]): readonly UnreadableItem[] {
  const fits = items.filter((i): i is UnreadableItem & { ref: UnreadableRef } => i.ref !== BROKEN)
  return [...newestFirst(fits, i => i.ref.moved), ...items.filter(i => i.ref === BROKEN)]
}

// 書庫の画面の右の枠が見せている行の id（見せる順）: 開いているフォルダ opened がゴミ箱・読めない物のフォルダ（直下の物 unreadable）なら、その一覧の順、ほかは並びの順。
// ビューと、右の枠で行を選ぶコマンドが、同じ順を使う
export function paneIdsOf(
  folders: Folders,
  unreadable: readonly UnreadableItem[],
  opened: string,
  desks: readonly Workdesk[],
): readonly string[] {
  if (opened === TRASH_ID) return trashNewestFirst(trashRefsOf(folders)).map(r => r.id)
  if (opened === UNREADABLE_ID) return unreadableOrder(unreadable).map(i => i.id)
  const under = childrenOf(folders, opened, desks)
  if (under !== undefined) return under.map(c => c.id)
  // ブックは、参照エントリの行も並べる（rowsIn と同じ並び）
  const holder = folders[opened]
  return holder?.folderRole === "book" ? holder.lineup.map(r => r.id) : entriesIn(folders, opened).map(r => r.id)
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
export const holdsRows = (row: LibraryRow): boolean => row.kind !== "page" && row.readable && row.nothingIn !== true

// 書庫の画面で開いているフォルダ: 値 folder のフォルダが在ればそれ、無ければ書庫ホーム。ゴミ箱の中のフォルダは開けないので、ゴミ箱。
// 読めない物のフォルダは、書庫の表に無くても開ける（ツリーに出していなくても、ツリーの下の「⚠ 読めない物」から開く）
// 作業机とその下の行は、その行が今在れば、それ。無くなっていれば、残っている一番近い上の行（作業机も無ければ、ワークルームのフォルダ）
export const openedFolderOf = (folders: Folders, folder: string, desks: readonly Workdesk[]): string =>
  isDeskRow(folder)
    ? openedDeskRow(folders, folder, desks)
    : folder === UNREADABLE_ID
      ? UNREADABLE_ID
      : !folders[folder]
        ? HOME_ID
        : inTrash(folders, folder)
          ? TRASH_ID
          : folder

function openedDeskRow(folders: Folders, folder: string, desks: readonly Workdesk[]): string {
  const place = deskPlaceOf(desks, folders, folder)
  if (place === undefined || place === GONE) return workroomsFolderOf(folders) ?? HOME_ID
  if (deskHolds(folders, place)) return place.id
  return place.at === "entry" ? deskBookRowId(place.desk.room) : deskRowId(place.desk.room)
}

// ツリーで中を出しているフォルダ: 値 unfolded が無ければ、書庫ホームだけ
export const AT_FIRST: readonly string[] = [HOME_ID]

// パンくず: 一番上（書庫ホームかゴミ箱）からフォルダ folder までの、フォルダの id の列
// 作業机とその下の行なら、ワークルームのフォルダまでの道に、作業机からその行までを続ける
export function pathTo(folders: Folders, folder: string, desks: readonly Workdesk[]): string[] {
  const place = deskPlaceOf(desks, folders, folder)
  const rooms = place === undefined ? undefined : workroomsFolderOf(folders)
  if (place !== undefined && place !== GONE && rooms !== undefined)
    return [...pathTo(folders, rooms, desks), ...deskPathOf(folders, place)]
  return [
    ...foldersOver(folders, folder)
      .map(f => f.id)
      .reverse(),
    folder,
  ]
}

// ブックの外のページ page を入れている、ブックの外のバインダの行（page がバインダに直に入っていて、そのバインダがブックにもゴミ箱にも入っていないとき。ほかは undefined）
function outsideBinderOver(folders: Folders, page: string): Folder | undefined {
  const [near, ...above] = foldersOver(folders, page)
  if (near?.folderRole !== "binder" || folders[page] !== undefined || inTrash(folders, page)) return undefined
  return above.some(f => f.folderRole === "book") ? undefined : near
}

// ブックの外のページ page の置き場所: 書庫ホームから、そのページ（ブックの外のバインダの中のページなら、そのバインダ）の入っているフォルダまでの、フォルダの id の列
// （書庫ホームに直に在れば、書庫ホームだけ）。ステージで開けるブックの外のページの置き場所（core/folders-tree.ts の atOutsidePagePlace）にも、ブックの外のバインダの中にも無ければ空。
// ブックの外のページは作業机の下に無いので、作業机は渡さない
export function outsidePagePlaceOf(folders: Folders, page: string): string[] {
  const entry = atOutsidePagePlace(folders, page) ? page : outsideBinderOver(folders, page)?.id
  const holder = entry === undefined ? undefined : foldersOver(folders, entry)[0]
  return holder ? pathTo(folders, holder.id, NO_DESKS) : []
}

// 行を開いたとき（2 回押し）の行き先: フォルダは中へ入る、ブックとその中のページ・バインダはブックを窓に出す、ブックの外のページはそのページを、
// ブックの外のバインダはそのバインダを（中のページの行なら、そのページで）窓に出す。ゴミ箱の中の物・読めない物は開かない（NOT_OPENED）
export type OpenTarget =
  | { to: "folder"; folder: string }
  | { to: "book"; book: string; page?: string; binder?: string; reference?: string }
  | { to: "page"; page: string }
  | { to: "binder"; binder: string; page?: string }
  | typeof NOT_OPENED
export const NOT_OPENED = "not-opened"

// 作業机とその下の行: 作業机は中へ入る、ワーカーブックとその中の物は実の物で開く（実のブックがまだ無ければ開かない）
export function openTargetOf(
  folders: Folders,
  row: Pick<LibraryRow, "id" | "kind" | "readable">,
  desks: readonly Workdesk[],
): OpenTarget {
  const place = deskPlaceOf(desks, folders, row.id)
  if (place !== undefined) {
    if (place === GONE) return NOT_OPENED
    if (place.at === "desk") return { to: "folder", folder: place.id }
    return place.real === undefined ? NOT_OPENED : openTargetOf(folders, { ...row, id: place.real }, desks)
  }
  if (row.kind === "reference") {
    const book = bookOfReference(folders, row.id)
    return book && !inTrash(folders, book.id) ? { to: "book", book: book.id, reference: row.id } : NOT_OPENED
  }
  if (!row.readable || row.id === TRASH_ID || inTrash(folders, row.id)) return NOT_OPENED
  if (row.kind === "folder") return { to: "folder", folder: row.id }
  if (row.kind === "book") return { to: "book", book: row.id }
  const book = foldersOver(folders, row.id).find(f => f.folderRole === "book")
  if (book)
    return row.kind === "page"
      ? { to: "book", book: book.id, page: row.id }
      : { to: "book", book: book.id, binder: row.id }
  if (row.kind === "binder") return { to: "binder", binder: row.id }
  if (row.kind !== "page") return NOT_OPENED
  if (atOutsidePagePlace(folders, row.id)) return { to: "page", page: row.id }
  const binder = outsideBinderOver(folders, row.id)
  return binder ? { to: "binder", binder: binder.id, page: row.id } : NOT_OPENED
}

// 行を開くと出すブックと、そのページ
export interface BookOpened {
  book: string
  page?: string // 開くページ（参照エントリの行なら、その参照エントリ。showBook）
}

// 書庫の行 row を、ブックスクリーンに開くなら、開くブックとページか参照エントリ（ページの無いブック・バインダ・ブックの外の物・フォルダは undefined）。
// ワーカーブックの行は、実のブックで開く（ページが在るときだけ）
export function bookOpenedFrom(
  folders: Folders,
  row: Pick<LibraryRow, "id" | "kind" | "readable">,
  desks: readonly Workdesk[],
): BookOpened | undefined {
  const pagesIn = (book: string) => rowsWithin(folders, book).pages.length
  if (isDeskRow(row.id)) {
    const place = deskPlaceOf(desks, folders, row.id)
    if (place === undefined || place === GONE || place.at !== "book" || place.real === undefined) return undefined
    return pagesIn(place.real) > 0 ? { book: place.real } : undefined
  }
  const target = openTargetOf(folders, row, desks)
  if (target === NOT_OPENED || target.to !== "book" || target.binder !== undefined) return undefined
  if (target.reference !== undefined) return { book: target.book, page: target.reference }
  if (target.page !== undefined) return { book: target.book, page: target.page }
  return pagesIn(target.book) > 0 ? { book: target.book } : undefined
}

// 書庫の画面が、中身を並べて見せているフォルダ: 右の枠で開いているフォルダ opened（ゴミ箱を開いていればゴミ箱）と、ツリーで中を出しているフォルダ
// （unfolded のうち、上のフォルダが全部 unfolded に在る物。ゴミ箱の中は、ツリーに出さない）
// 作業机とその下の行は、実の物の id で答える（実の物の無い行は答えない）
export function shownFoldersOf(
  folders: Folders,
  opened: string,
  unfolded: readonly string[],
  desks: readonly Workdesk[],
): string[] {
  const open = new Set(unfolded)
  const inTree = unfolded.filter(id =>
    isDeskRow(id)
      ? pathTo(folders, id, desks)
          .slice(0, -1)
          .every(f => open.has(f))
      : id !== TRASH_ID && folders[id] !== undefined && foldersOver(folders, id).every(f => open.has(f.id)),
  )
  return [...new Set([opened, ...inTree].map(id => realOf(desks, folders, id)).filter(id => !isDeskRow(id)))]
}

// ツリーで中を出せる行か: 中へ入れる行で、ゴミ箱でない（ゴミ箱の中は、ツリーに出さない）。holds は、中へ入れる行か
export const unfoldable = (id: string, holds: boolean): boolean => holds && id !== TRASH_ID && id !== UNREADABLE_ID

// 行 row（holder はそれを持つフォルダ、holds は中へ入れる行か）へ移ったときの、書庫の画面の値: 右の枠に中身を出すフォルダ folder
// （中へ入れる行なら、その行。入れない行なら、それを持つフォルダ）、選ぶ行 picked（中へ入れない行だけ）、ツリーで中を出すフォルダ unfolded（その行までの道を、今の now に足した物。足す物が無ければ now のまま）
export function arrivedAt(
  folders: Folders,
  row: { id: string; holder: string; holds: boolean },
  now: readonly string[],
  desks: readonly Workdesk[],
): { folder: string; picked: string | undefined; unfolded: readonly string[] } {
  const folder = row.holds ? row.id : row.holder
  const over = row.holds ? pathTo(folders, folder, desks).slice(0, -1) : pathTo(folders, folder, desks)
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
// （ワークルームのフォルダの下は、作業机とその下の行。desks は作業机）
export function treeRowsOf(
  folders: Folders,
  unfolded: readonly string[],
  unreadableShown: boolean,
  desks: readonly Workdesk[],
): TreeRow[] {
  const open = new Set(unfolded)
  const under = (id: string, holder: string, holds: boolean): TreeRow[] => {
    if (!unfoldable(id, holds)) return [{ id, holder, holds, unfolded: NOT_UNFOLDABLE }]
    const shown = open.has(id)
    if (!shown) return [{ id, holder, holds, unfolded: false }]
    const projected = childrenOf(folders, id, desks)
    const below = projected
      ? projected.map(c => ({ id: c.id, holds: c.holds }))
      : entriesIn(folders, id).map(r => ({ id: r.id, holds: r.kind !== "page" && folders[r.id] !== undefined }))
    return [{ id, holder, holds, unfolded: true }, ...below.flatMap(c => under(c.id, id, c.holds))]
  }
  // 一番上の行は、表に行が無くても（何も入れた事のないゴミ箱）、中へ入れる
  return topIdsOf(unreadableShown).flatMap(id => under(id, id, true))
}

// 行の並び ids のうち、Tab で止まる行: 止めたい行 want が並びに在ればそれ、無ければ fallback（言わなければ最初の行。並びが空なら undefined）
export function tabStopOf(ids: readonly string[], want: string | undefined, fallback = ids[0]): string | undefined {
  return want !== undefined && ids.includes(want) ? want : fallback
}

// ツリーで今いる行: 中へ入れない行（ページなど）を選んでいればその行、ほかは、右の枠に中身を出しているフォルダ opened
export function treeCurrentOf(
  folders: Folders,
  opened: string,
  picked: string | undefined,
  desks: readonly Workdesk[],
): string {
  if (picked === undefined) return opened
  const place = deskPlaceOf(desks, folders, picked)
  const holds = place === undefined ? folders[picked] !== undefined : place !== GONE && deskHolds(folders, place)
  return holds ? opened : picked
}

// 書庫で参照を選んでいる間の物: ブック book に置く参照の指す先を選ぶ（referred。ページタブの＋の「参照…」から）か、of を指す参照を置くブックを選ぶ（book。書庫の右クリックの「参照を置く…」から）
export type Choosing = { choose: "referred"; book: string } | { choose: "book"; of: ReferenceEntry["of"] }

// 選んでいる物 choosing が今も続けられるか（置く先のブック・指す先が、書庫の見える所に在る）。続けられなければ undefined（参照を選んでいない間と同じに扱う）
export function choosingNow(folders: Folders, choosing: Choosing | undefined): Choosing | undefined {
  if (choosing === undefined) return undefined
  if (choosing.choose === "referred") return holdsNewReference(folders, choosing.book) ? choosing : undefined
  return referableTarget(folders, choosing.of) ? choosing : undefined
}

// 選んでいる物 choosing での行 id の扱い: 選べるなら chosen に置き先と指す先。選べないとき、中へ入れる行なら enters（フォルダと、置く参照を選んでいるときのブック）。
// どちらでもない行は薄く描き、押しても何もしない
export function chooseLookOf(
  folders: Folders,
  choosing: Choosing,
  id: string,
  desks: readonly Workdesk[],
): { chosen: { book: string; of: ReferenceEntry["of"] } | undefined; enters: boolean } {
  const chosen = chosenBy(folders, choosing, id, desks)
  const kind = placeOf(folders, realOf(desks, folders, id))?.ref.kind
  return {
    chosen,
    enters: chosen === undefined && (kind === "folder" || (choosing.choose === "referred" && kind === "book")),
  }
}

// 選んでいる物 choosing で、行 id を選べるか（作業机の下の行は実の物で）。選べるなら、置く参照エントリの置き先と指す先
export function chosenBy(
  folders: Folders,
  choosing: Choosing,
  id: string,
  desks: readonly Workdesk[],
): { book: string; of: ReferenceEntry["of"] } | undefined {
  const real = realOf(desks, folders, id)
  const kind = placeOf(folders, real)?.ref.kind
  if (choosing.choose === "referred") {
    if (kind !== "page" && kind !== "binder") return undefined
    const of = { kind, id: real }
    return referableIn(folders, choosing.book, of) ? { book: choosing.book, of } : undefined
  }
  return kind === "book" && referableIn(folders, real, choosing.of) ? { book: real, of: choosing.of } : undefined
}
