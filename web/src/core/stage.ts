// ステージ: 画面の見える領域の 1 つ。ブックを 1 つ開くか、何も開いていない。ブックを開いたら、そのページを 1 つ開き
// （ページが無ければ開かない）、開いたページの紙を置く。表示領域の大きさ・倍率・ずらす量と、置こうとしているアイテム・選択を持つ
// （道具はステージではなく、道具の組ごとに窓が持つ。core/tools.ts）。
// ずらす量は、いつも範囲に収めた値で持つ（収めるのはここの操作だけで、描く側は直さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを返す）

import { anchorIds } from "./annotation"
import {
  findBinder,
  findPage,
  findReference,
  foundPage,
  lineupOf,
  NO_BINDER,
  NO_PAGE,
  pagesIn,
  pagesOf,
  referencesOf,
} from "./book"
import type { ItemId } from "./catalog"
import type { CoreCatalog, PageTypeId } from "./core-catalog"
import { isInStageEntry } from "./def/action"
import { type EditList, slideIsBackground } from "./def/page-type"
import { type Library, pageIn } from "./folders"
import { outsideAsked, outsideBinderIn, outsidePageIn, type StageEntry } from "./folders-tree"
import type { Point, Size } from "./geom"
import type { AskedOutermost } from "./inspect"
import type { LibraryAndBooks } from "./library"
import { type PaperChoice, type ResolvedPaper, resolvePaper } from "./paper"
import type { ItemPage } from "./placed"
import { referencePage } from "./references"
import { sameData } from "./same"
import type { BinderEntry, Book, Page, ReferenceEntry } from "./schema/book"
import { clampPan, contentSize, paperOrigin } from "./viewport"

// 開いているブックと、その中で開いているもの。開いているものは 3 通り:
// - none: ブックを開いているが、ページが 1 枚も無い（ステージが何も開いていないのは、Stage の opened が NOTHING_OPENED）
// - binder: 空のバインダ（中のページが 1 枚も無い。type はバインダが入れるページのタイプ）
// - page: ページ。ページのタイプと、描く紙を写して持つ（開くときと、ブックが変わったときに決め直す）。
//   area は、プレゼンテーションが描く広さ（可変ページで、印刷区画を並べた広さ）。プレゼンテーションが知らせるまでと、紙 1 枚で描くページでは NO_AREA。
//   shift は、開いたページの中身をずらした量（ページの shift を写す。ずらしていなければ NO_SHIFT。変わったらパンを合わせる）。
//   origin は、位置をデータに持たないプレゼンテーションが、描く中身を右・下へずらした量（印刷区画の数。プレゼンテーションが広さと一緒に知らせる。ずらさなければ NO_ORIGIN。変わったらパンを合わせる）
// - reference: 並びの参照エントリ（core/references.ts）。指す先を見るだけで描く（ページを開いていないので、選ぶ・置く・付箋は始まらない）。
//   描くページ・紙・見た目は持たず、描く側が書庫から毎回引く（指す先はほかのブックで変わる）。chosen は、バインダを指すときに選んだページ（選んでいなければ NO_PAGE で、最初のページ）。
//   area は、描く側が知らせた、描いた広さ（知らせるまでと、描く物が無いときは NO_AREA）
// ページが入っているバインダは持たない（ブックから引く。core/book.ts の findPage）
export type Opened = OpenedNone | OpenedBinder | OpenedPage | OpenedReference
interface OpenedBook {
  outermost: StageEntry // 開いているステージエントリ
}
export interface OpenedNone extends OpenedBook {
  kind: "none"
}
export interface OpenedBinder extends OpenedBook {
  kind: "binder"
  binder: string // バインダの id
  type: PageTypeId
}
export interface OpenedPage extends OpenedBook {
  kind: "page"
  page: string // 開いているページの id
  type: PageTypeId
  paper: ResolvedPaper | typeof NO_PAPER // 描く紙（プレゼンテーションが紙を置かなければ NO_PAPER）
  area: Size | typeof NO_AREA
  shift: Point | typeof NO_SHIFT
  origin: Point | typeof NO_ORIGIN
}
export interface OpenedReference extends OpenedBook {
  kind: "reference"
  reference: string // 参照エントリの id
  chosen: string
  area: Size | typeof NO_AREA
}

// 開いたページの area・印刷プレビューの area の、広さを持たない（紙 1 枚で描く・プレゼンテーションがまだ知らせていない）ときの値
export const NO_AREA = "none"
// 開いたページの shift の、中身をずらしていないときの値
export const NO_SHIFT = "none"
// 開いたページの origin の、描く中身をずらさないときの値
export const NO_ORIGIN = "none"

// ステージの opened の、何も開いていない（ブックもブックの外のページ・バインダも開いていない）ときの値
export const NOTHING_OPENED = "none"
// ステージが無いときの値（ステージを持たない所から開いたダイアログ・向け先がステージでないときなど）
export const NO_STAGE = "none"
export { NO_PAGE } from "./book"
// 開いている物にページのタイプが無い（ページも空のバインダも開いていない）ときの値
export const NO_PAGE_TYPE = "none"
// 紙が無い（ページを開いていないか、プレゼンテーションが紙を置かない）ときの値
export const NO_PAPER = "none"
// ステージの placing の、置こうとしている物が無いときの値
export const NO_PLACING = "none"

// 開いている物のステージエントリ（何も開いていない・ステージが無ければ undefined）
export const openedEntry = (opened: Opened | typeof NOTHING_OPENED | undefined): StageEntry | undefined =>
  opened === undefined || opened === NOTHING_OPENED ? undefined : opened.outermost

// ページを開いていれば、その開いているもの（開いていなければ NO_PAGE）
export const openedPage = (opened: Opened | typeof NOTHING_OPENED): OpenedPage | typeof NO_PAGE =>
  opened !== NOTHING_OPENED && opened.kind === "page" ? opened : NO_PAGE
// 開いているページの id（ページを開いていなければ NO_PAGE）
export const shownPageId = (opened: Opened | typeof NOTHING_OPENED): string => {
  const o = openedPage(opened)
  return o === NO_PAGE ? NO_PAGE : o.page
}
// 開いているページのタイプ（空のバインダを開いていれば、バインダが入れるタイプ。どちらでもなければ NO_PAGE_TYPE）
export const shownType = (opened: Opened | typeof NOTHING_OPENED): PageTypeId | typeof NO_PAGE_TYPE =>
  opened !== NOTHING_OPENED && (opened.kind === "page" || opened.kind === "binder") ? opened.type : NO_PAGE_TYPE

// ページ page の紙を、ステージに置く紙に決める（タイプ type のプレゼンテーションが紙を置かなければ NO_PAPER）
function stagePaper(catalog: CoreCatalog, page: PaperChoice & Pick<Page, "type">): ResolvedPaper | typeof NO_PAPER {
  const presentation = catalog.presentations.get(catalog.pageTypes.get(page.type)?.presentation ?? "")
  return presentation?.paper === false ? NO_PAPER : resolvePaper(catalog, page)
}

// ページの中身をずらした量（印刷区画の数。ずらしていなければ持たない）
const shiftOf = (page: Page): Point | typeof NO_SHIFT => page.shift ?? NO_SHIFT
// 中身をずらした量（ずらしていなければ 0）
const pointOr = (p: Point | typeof NO_SHIFT | typeof NO_ORIGIN): Point => (p === NO_SHIFT ? ORIGIN : p)

// ステージの見え方: 開いたページを編集するか、印刷プレビュー（開いたブックの全ページの印刷区画を並べて、見るだけ）か。
// 印刷プレビューの間、ずらす量と倍率は並べた広さ area（プレゼンテーションが知らせるまでは NO_AREA）で決め、開く前の倍率とずらす量 back を閉じたときに戻す。
// 開いたページはそのまま持つ（閉じたらそのページの編集に戻る）
export type StageMode =
  | { kind: "edit" }
  | { kind: "print-preview"; area: Size | typeof NO_AREA; back: { zoom: number; pan: Point } }

// 置こうとしている物: アイテムと、置くときに渡す項目の値（NO_PROPS なら、アイテムの既定の項目で置く）
export interface Placing {
  item: ItemId
  props: Readonly<Record<string, unknown>> | typeof NO_PROPS
}
// 置こうとしている物の props の、項目の値を渡さない（アイテムの既定の項目で置く）ときの値
export const NO_PROPS = "none"

// その場の編集の名前: 編集していなければ "none"、しているなら何の編集かをプラグインが kit.name で付けた名前（<プラグインの id>:<名前>）
export type Editing = "none" | `${string}:${string}`

export interface Stage {
  id: string
  opened: Opened | typeof NOTHING_OPENED // 何も開いていなければ NOTHING_OPENED
  mode: StageMode
  zoom: number
  pan: Point // ずらす量（viewport.ts）
  view: Size | null // 表示領域の大きさ（測るまでは null）
  // 直している並び: ページの items か、背景（ページの slide。背景を持つタイプの、背景編集モードの間）。開くページやブックが替わると items に戻る
  edits: EditList
  placing: Placing | typeof NO_PLACING // 置こうとしている物（ツールボックスなどで選んだもの。置くか取り消すまで）
  selection: readonly string[] // 選んでいる物の id（開いているページのアイテムや、ページのフィールドの中の物）
  // 選んでいる物を、今その場で何として編集しているか（選びが替わる・開くものが変わる・道具を替えると終わる）。編集していなければ "none"
  editing: Editing
  // 開いている道具のアイコン（at は出す所の画面の座標。null なら画面が決める）
  picker: { at: Point | null } | null
  // 初めの位置で表示領域の左上に置く紙の点（中身の載った印刷区画の左上。ビューが知らせる。開くたびに捨て、知らせるまでは null で紙の左上）
  start: Point | null
  // 開いてから、まだ利用者もコマンドも見え方を動かしておらず、初めの位置に合わせ終えていないか（start と広さが届いたら合わせて下ろす）
  starting: boolean
}

// 紙を置く位置（表示領域の左上から）と、倍率をかける前の大きさ（可変ページは、プレゼンテーションが知らせた広さ。areaOf）
export interface Placement {
  x: number
  y: number
  w: number
  h: number
  zoom: number
}

const ORIGIN: Point = { x: 0, y: 0 }
const NONE: readonly string[] = []
const EDIT: StageMode = { kind: "edit" }

export function newStage(id: string, opened: Opened | typeof NOTHING_OPENED = NOTHING_OPENED): Stage {
  return {
    id,
    opened,
    mode: EDIT,
    zoom: 1,
    pan: ORIGIN,
    view: null,
    edits: "items",
    placing: NO_PLACING,
    selection: NONE,
    editing: "none",
    picker: null,
    start: null,
    starting: false,
  }
}

// 開くものが変わったときに、置こうとしているアイテムと選択を捨て（その場の編集も終える）、道具のアイコンを閉じる
function leave(stage: Stage): Stage {
  if (stage.placing === NO_PLACING && stage.selection.length === 0 && stage.picker === null && stage.editing === "none")
    return stage
  return { ...stage, placing: NO_PLACING, selection: NONE, editing: "none", picker: null }
}

// ステージに出す紙の大きさ（ページを開いていないか、プレゼンテーションが紙を置かないなら NO_PAPER）
export const paperOf = (stage: Pick<Stage, "opened">): Size | typeof NO_PAPER => {
  const o = openedPage(stage.opened)
  return o === NO_PAGE || o.paper === NO_PAPER ? NO_PAPER : o.paper.size
}

// 参照エントリを開いていれば、その開いているもの（開いていなければ NO_REFERENCE）
export const NO_REFERENCE = "none"
export const openedReference = (opened: Opened | typeof NOTHING_OPENED): OpenedReference | typeof NO_REFERENCE =>
  opened !== NOTHING_OPENED && opened.kind === "reference" ? opened : NO_REFERENCE

// ステージに描く広さ（プレゼンテーションが知らせた広さ。無ければ紙 1 枚。紙が無ければ NO_PAPER）。ずらす量の範囲・紙の枠の大きさ・全体を収める倍率は、これで決める
export function areaOf(stage: Pick<Stage, "opened">): Size | typeof NO_PAPER {
  const ref = openedReference(stage.opened)
  if (ref !== NO_REFERENCE) return ref.area === NO_AREA ? NO_PAPER : ref.area
  const paper = paperOf(stage)
  const o = openedPage(stage.opened)
  return paper === NO_PAPER || o === NO_PAGE ? NO_PAPER : o.area === NO_AREA ? paper : o.area
}

// ずらす量の範囲・全体を収める倍率を決める広さ: 印刷プレビューの間は並べた広さ（知らせるまでは null）、ほかは areaOf
export function extentOf(stage: Pick<Stage, "opened" | "mode">): Size | null {
  if (stage.mode.kind === "print-preview")
    return stage.opened !== NOTHING_OPENED && stage.mode.area !== NO_AREA ? stage.mode.area : null
  const area = areaOf(stage)
  return area === NO_PAPER ? null : area
}

// 印刷プレビューの間か（間は、選ぶ・置く・その場の編集・道具のアイコンを始めず、ブックを変えるアクションを止める。stageBlocks）
export const previewing = (stage: Pick<Stage, "mode">): boolean => stage.mode.kind === "print-preview"

// 見え方が mode のステージから行うと止めるアクションか: 印刷プレビューの間の、ステージエントリの中の物を変えるアクション（ブック・ページ・ページのアノテーションが対象の物。
// 印刷プレビューの間も行う印 inPrintPreview のあるものを除く）。止めるのはそのステージから行う物だけで、AI やほかのステージは止めない。
// changes は、アクションが変える物の見方: "target" は対象のとおり、"opened-entry" は、対象に依らず開いているステージエントリを変える物として扱う
// （許可スコープを書いたコマンドが行う、一覧が対象のアクション）
export function stageBlocks(
  catalog: CoreCatalog,
  mode: StageMode["kind"],
  action: string,
  changes: "target" | "opened-entry" = "target",
): boolean {
  const def = catalog.actions.get(action)
  const inEntry = changes === "opened-entry" || isInStageEntry(def?.target)
  return mode === "print-preview" && inEntry && def?.inPrintPreview !== "runs"
}

// プレゼンテーションが描く広さを area に、描く中身をずらした量を origin にする（null なら紙 1 枚に戻し、ずらさない）。origin が変わったら、
// 中身が画面の同じ所に見えるよう、変わった分だけパンを合わせる。ずらす量は範囲に収め直す
export function setArea(stage: Stage, area: Size | null, origin: Point | null = null): Stage {
  const o = openedPage(stage.opened)
  const sheet = paperOf(stage)
  if (o === NO_PAGE || sheet === NO_PAPER) return stage
  const now = o.area === NO_AREA ? null : o.area
  const was = pointOr(o.origin)
  const next = area ? (origin ?? ORIGIN) : ORIGIN
  const sameArea = now === area || (now && area && now.w === area.w && now.h === area.h)
  if (sameArea && was.x === next.x && was.y === next.y) return stage
  const opened: OpenedPage = {
    ...o,
    area: area ?? NO_AREA,
    origin: next.x !== 0 || next.y !== 0 ? next : NO_ORIGIN,
  }
  const dx = (next.x - was.x) * sheet.w * stage.zoom
  const dy = (next.y - was.y) * sheet.h * stage.zoom
  return reachStart(settle({ ...stage, opened }, { x: stage.pan.x - dx, y: stage.pan.y - dy }))
}

// 初めの位置で表示領域の左上に置く紙の点を start にする（ビューが知らせる）。開いたばかりなら、初めの位置に合わせる
export function setStart(stage: Stage, start: Point): Stage {
  const was = stage.start
  if (stage.opened === NOTHING_OPENED || (was && was.x === start.x && was.y === start.y)) return stage
  return reachStart({ ...stage, start })
}

// 倍率 zoom で、start が表示領域の左上に来るずらす量（知らせる前は紙の左上）
function startPan(stage: Stage, zoom: number): Point {
  const s = stage.start ?? ORIGIN
  return { x: 0 - s.x * zoom, y: 0 - s.y * zoom }
}

// 開いたばかり（starting）で start が届いていれば、初めの位置に合わせて印を下ろす。紙の左上でない start は、プレゼンテーションの広さが届くまで待つ
// （届く前は紙 1 枚の範囲に収めてしまう）
function reachStart(stage: Stage): Stage {
  const s = stage.start
  if (!stage.starting || !s) return stage
  const o = openedPage(stage.opened)
  if ((s.x !== 0 || s.y !== 0) && (o === NO_PAGE || o.area === NO_AREA)) return stage
  return settle(stopStart(stage), startPan(stage, stage.zoom))
}

// ずらす量を pan にして範囲に収める。見え方が変われば、利用者やコマンドが動かしたので、初めの位置に合わせる印を下ろす
function moveTo(stage: Stage, pan: Point): Stage {
  const next = settle(stage, pan)
  return next === stage ? stage : stopStart(next)
}

// 利用者やコマンドが見え方を動かした（URL の場所を当てはめたときも）: 初めの位置に合わせる印を下ろす
export function stopStart(stage: Stage): Stage {
  return stage.starting ? { ...stage, starting: false } : stage
}

// ページを開いたステージ: 知らされた初めの位置を捨て、紙を置くなら初めの位置に合わせる印を立てる
function opening(stage: Stage, opened: Opened): Stage {
  return {
    ...stage,
    opened,
    edits: "items",
    start: null,
    starting: opened.kind === "page" && opened.paper !== NO_PAPER,
  }
}

// ずらす量を pan にして、範囲に収める
function settle(stage: Stage, pan: Point): Stage {
  const paper = extentOf(stage)
  const next = stage.view && paper ? clampPan(stage.view, contentSize(paper, stage.zoom), pan) : pan
  if (next.x === stage.pan.x && next.y === stage.pan.y) return stage
  return { ...stage, pan: next }
}

export function resize(stage: Stage, view: Size): Stage {
  if (stage.view && stage.view.w === view.w && stage.view.h === view.h) return stage
  return settle({ ...stage, view }, stage.pan)
}

// 紙が無ければずらさない
export function panBy(stage: Stage, dx: number, dy: number): Stage {
  if (!extentOf(stage)) return stage
  return moveTo(stage, { x: stage.pan.x + dx, y: stage.pan.y + dy })
}

// 開いている物 opened のブック（何も開いていない・開いている物がブックでない・表 books に無ければ undefined）
export const openedBook = (
  books: Readonly<Record<string, Book>>,
  opened: Opened | typeof NOTHING_OPENED | undefined,
): Book | undefined =>
  opened !== undefined && opened !== NOTHING_OPENED && opened.outermost.kind === "book"
    ? books[opened.outermost.id]
    : undefined

// ステージで開いている物 opened のうち、アクションを使えるかを問う相手: ブックか、ブックでないステージエントリ（ブックの外のページ・バインダ）なら開いているページ 1 枚。
// 何も開いていない・もう無ければ undefined
export function askedOutermostOf(
  from: LibraryAndBooks,
  opened: Opened | typeof NOTHING_OPENED | undefined,
): AskedOutermost | undefined {
  const book = openedBook(from.books, opened)
  if (book) return { book }
  const page = openedOutside(from, opened)
  if (!page || opened === undefined || opened === NOTHING_OPENED) return undefined
  const binder = opened.outermost.kind === "binder" ? outsideBinderIn(from, opened.outermost.id) : undefined
  const asked = outsideAsked(from.folders, page)
  return binder ? { ...asked, binder } : asked
}

// ブックでないステージエントリ（ブックの外のページ・バインダ）を開いているときの、開いているページ（ブックを開いている・何も開いていない・もう無ければ undefined）
export function openedOutside(
  library: Library,
  opened: Opened | typeof NOTHING_OPENED | undefined,
): ItemPage | undefined {
  if (opened === undefined || opened === NOTHING_OPENED || opened.kind !== "page") return undefined
  const { kind, id } = opened.outermost
  if (kind === "page") return outsidePageIn(library, id)
  if (kind !== "binder") return undefined
  return outsideBinderIn(library, id)?.lineup.some(p => p.id === opened.page)
    ? pageIn(library.pages, opened.page)
    : undefined
}

const entryOf = (book: Pick<Book, "id">): StageEntry => ({ kind: "book", id: book.id })

// ステージエントリ outermost のページ page を開いた形（タイプ・紙・ずらした量はページから写す）
function openedAt(catalog: CoreCatalog, outermost: StageEntry, page: Page): OpenedPage {
  return {
    kind: "page",
    outermost,
    page: page.id,
    type: page.type as PageTypeId,
    paper: stagePaper(catalog, page),
    area: NO_AREA,
    shift: shiftOf(page),
    origin: NO_ORIGIN,
  }
}

// ブック book の参照エントリ reference を開いた形（選んだページは無し・広さは知らせを待つ）
const openedRef = (book: Pick<Book, "id">, reference: string, chosen: string = NO_PAGE): OpenedReference => ({
  kind: "reference",
  outermost: entryOf(book),
  reference,
  chosen,
  area: NO_AREA,
})

// ブック book の、並びの最初を開いた形: 最初がページならそのページ、バインダならその最初のページ（空のバインダならバインダ）、参照エントリならそれ。並びが空なら何も開かない
function openedFirst(catalog: CoreCatalog, book: Book): Opened {
  const [first] = lineupOf(book)
  if (!first) return { kind: "none", outermost: entryOf(book) }
  if (first.kind === "reference") return openedRef(book, first.id)
  return first.kind === "page" ? openedAt(catalog, entryOf(book), first) : openedIn(catalog, book, first.id)
}

// ブック book のバインダ binder を開いた形: 中の最初のページ（空なら、バインダ。バインダが無ければ何も開かない）
function openedIn(catalog: CoreCatalog, book: Book, binder: string): Opened {
  const found = findBinder(book, binder)
  if (found === NO_BINDER) return { kind: "none", outermost: entryOf(book) }
  const [first] = found.lineup
  return first
    ? openedAt(catalog, entryOf(book), first)
    : { kind: "binder", outermost: entryOf(book), binder: found.id, type: found.pageType as PageTypeId }
}

// ブックを開く（並びの最初）。ずらす量は紙の左上に戻し（初めの位置 start が届いたらそこへ合わせる。starting）、印刷プレビューは閉じる（開く前の倍率に戻す）
export function openBook(catalog: CoreCatalog, stage: Stage, book: Book): Stage {
  return settle(leave(opening(edited(stage), openedFirst(catalog, book))), ORIGIN)
}

// ブックの外のページ page を開く（ずらす量と印刷プレビューは openBook と同じ）。もう開いていれば、同じ値を返す
export function openOutsidePage(catalog: CoreCatalog, stage: Stage, page: Page): Stage {
  const to = openedAt(catalog, { kind: "page", id: page.id }, page)
  const was = stage.opened === NOTHING_OPENED ? undefined : stage.opened.outermost
  return sameData(to.outermost, was) ? stage : settle(leave(opening(edited(stage), to)), ORIGIN)
}

// ブックの外のバインダ binder を開く: page のページ（名指さなければ最初のページ。そのバインダに無いページなら最初のページ）。ずらす量と印刷プレビューは openBook と同じ。
// そのバインダをもう開いていれば、名指したページへ替えるだけ（名指さない・背景編集モードの間は、同じ値を返す。そのページをもう開いていれば、印刷プレビューを閉じるだけ）
export function openOutsideBinder(catalog: CoreCatalog, stage: Stage, binder: BinderEntry, page?: string): Stage {
  const found = binder.lineup.find(p => p.id === page) ?? binder.lineup[0]
  if (!found) return stage
  const o = stage.opened
  if (o !== NOTHING_OPENED && o.outermost.kind === "binder" && o.outermost.id === binder.id) {
    if (page !== undefined && shownPageId(o) === found.id) return closePrintPreview(stage)
    if (page === undefined || editingBackground(stage)) return stage
  }
  return settle(leave(opening(edited(stage), openedAt(catalog, { kind: "binder", id: binder.id }, found))), ORIGIN)
}

// 開いているブックのページを開く（開いているブックの、あるページだけ）。ずらす量は紙の左上に戻す（初めの位置が届いたらそこへ合わせる）。
// 印刷プレビューの間なら閉じて、そのページの編集にする（開いていたページなら、閉じるのと同じ）
export function openPage(catalog: CoreCatalog, stage: Stage, book: Book, page: string): Stage {
  const o = stage.opened
  const found = foundPage(findPage(book, page))
  if (o === NOTHING_OPENED || o.outermost.id !== book.id || !found) return stage
  if (shownPageId(o) === page) return closePrintPreview(stage)
  if (editingBackground(stage)) return stage // 背景編集モードの間は、ページを替えない
  const to = openedAt(catalog, entryOf(book), found)
  return sameData(to, o) ? stage : settle(leave(opening(edited(stage), to)), ORIGIN)
}

// 開いているブックのバインダを開く（中の最初のページ。空ならバインダ）。そのバインダのページか、そのバインダをもう開いていれば、印刷プレビューを閉じるだけ
export function openBinder(catalog: CoreCatalog, stage: Stage, book: Book, binder: string): Stage {
  const o = stage.opened
  if (o === NOTHING_OPENED || o.outermost.id !== book.id || findBinder(book, binder) === NO_BINDER) return stage
  if (binderOf(book, o) === binder) return closePrintPreview(stage)
  if (editingBackground(stage)) return stage
  return settle(leave(opening(edited(stage), openedIn(catalog, book, binder))), ORIGIN)
}

// 開いているブックの参照エントリ reference を開く（指す先がバインダなら、選んだページ chosen。無ければ最初のページ）。ずらす量は左上に戻す。
// それをもう開いていれば、ページを替えるだけ（名指さなければ印刷プレビューを閉じるだけ）。背景編集モードの間は替えない
export function openReference(stage: Stage, book: Book, reference: string, chosen?: string): Stage {
  const o = stage.opened
  if (o === NOTHING_OPENED || o.outermost.id !== book.id || !findReference(book, reference)) return stage
  if (editingBackground(stage)) return stage
  if (o.kind === "reference" && o.reference === reference && (chosen === undefined || chosen === o.chosen))
    return closePrintPreview(stage)
  return settle(leave(opening(edited(stage), openedRef(book, reference, chosen))), ORIGIN)
}

// 開いているものが入っているバインダの id（空のバインダを開いていればそのバインダ。バインダの外のページか、何も開いていなければ NO_BINDER）
export function binderOf(book: Book, opened: Opened | typeof NOTHING_OPENED): string {
  if (opened === NOTHING_OPENED) return NO_BINDER
  if (opened.kind === "binder") return opened.binder
  if (opened.kind !== "page") return NO_BINDER
  const at = findPage(book, opened.page)
  const binder = at === NO_PAGE ? NO_BINDER : at.binder
  return binder === NO_BINDER ? NO_BINDER : binder.id
}

// 開いているブックが変わったときに合わせる。開いていたページが残っていればそのページ（タイプと紙は決め直す）、
// 無くなっていれば隣（下の neighbourOf）。空のバインダを開いていて、バインダにページが入ったら、その最初のページ。
// 開くものが変わったときだけ、ずらす量を紙の左上に戻し（初めの位置が届いたらそこへ合わせる）、選択を捨てる。同じページで紙も同じまま中身をずらした（ページの shift が変わった）なら、
// 中身が画面の同じ所に見えるよう、ずらした分だけパンを合わせ、プレゼンテーションが知らせた広さもその分だけ先に変える（知らせ直す前に範囲に収め直して打ち消さないように）。
// 選択からは、開いているページに無くなった物（AI やほかの画面が消した物、Undo で無くなった物）を外す。
// そのブックを開いていなければ、同じ値を返す
export function followBook(catalog: CoreCatalog, stage: Stage, book: Book, before?: Book): Stage {
  const next = followOpened(catalog, stage, book, before)
  if (next.opened === NOTHING_OPENED || next.opened.outermost.id !== book.id) return next
  return selectionKept(next, foundPage(findPage(book, shownPageId(next.opened))))
}

// 開いているブックの外のページ page が変わったときに合わせる（followBook の、開いていたページが残っているときと同じ）。そのページを開いていなければ、同じ値を返す
export function followOutsidePage(catalog: CoreCatalog, stage: Stage, page: Page): Stage {
  const o = stage.opened
  if (o === NOTHING_OPENED || o.kind !== "page" || o.outermost.kind !== "page" || o.outermost.id !== page.id)
    return stage
  return selectionKept(followShown(catalog, stage, o, page), page)
}

// 開いているブックの外のバインダ binder が変わったときに合わせる（before は変わる前のそのバインダ）: 開いていたページが残っていればそのページ（followBook と同じ）、
// 無くなっていれば、変わる前の並びで後ろにあった残りのページ、無ければ前にあった残りのページ、無ければ最初のページ。そのバインダを開いていなければ、同じ値を返す
export function followOutsideBinder(
  catalog: CoreCatalog,
  stage: Stage,
  binder: BinderEntry,
  before?: BinderEntry,
): Stage {
  const o = stage.opened
  if (o === NOTHING_OPENED || o.kind !== "page" || o.outermost.kind !== "binder" || o.outermost.id !== binder.id)
    return stage
  const found = binder.lineup.find(p => p.id === o.page)
  if (found) return selectionKept(followShown(catalog, stage, o, found), found)
  const left = new Map(binder.lineup.map(p => [p.id, p]))
  const next = nearIn(before?.lineup.map(p => p.id) ?? [], o.page, left) ?? binder.lineup[0]
  if (!next) return stage
  return settle(leave(opening(stage, openedAt(catalog, o.outermost, next))), ORIGIN)
}

// 書庫が変わったとき、開いている参照エントリ（ブック book の物）に合わせる（now は今の書庫、before は変わる前の書庫）: 指すバインダで選んだページが無くなったら、
// 変わる前の並びで後ろにあった残りのページ、無ければ前にあった残りのページ、無ければ選ばない（最初のページ）にして、広さを捨て、左上に戻す。参照エントリを開いていなければ、同じ値を返す
export function followReference(stage: Stage, book: Book, now: Library, before?: Library): Stage {
  const o = openedReference(stage.opened)
  const ref = o === NO_REFERENCE || o.outermost.id !== book.id ? undefined : findReference(book, o.reference)
  if (o === NO_REFERENCE || !ref || o.chosen === NO_PAGE || referencePage(now, ref, o.chosen) === o.chosen) return stage
  const binder = ref.of.kind === "binder" ? now.folders[ref.of.id] : undefined
  const left = new Map(binder?.folderRole === "binder" ? binder.lineup.map(p => [p.id, p.id]) : [])
  const was = before?.folders[ref.of.id]
  const ids = was?.folderRole === "binder" ? was.lineup.map(p => p.id) : []
  const chosen = nearIn(ids, o.chosen, left) ?? NO_PAGE
  return settle(leave(opening(stage, { ...o, chosen, area: NO_AREA })), ORIGIN)
}

// 開いているブックでないステージエントリのページが、ブック book の中へ移されたとき、またはブックの外のバインダ into の中へ移されたときに合わせる:
// 同じページを、移った先の物として開いた形にする（倍率・ずらす量・選択はそのまま）。ブックでないステージエントリを開いていない・そのページが移った先に無ければ、同じ値を返す
export function followInto(catalog: CoreCatalog, stage: Stage, into: Book | BinderEntry): Stage {
  const o = stage.opened
  if (o === NOTHING_OPENED || o.kind !== "page" || o.outermost.kind === "book") return stage
  const binder = "kind" in into
  const found = binder ? into.lineup.find(p => p.id === o.page) : foundPage(findPage(into, o.page))
  if (!found) return stage
  const outermost: StageEntry = binder ? { kind: "binder", id: into.id } : entryOf(into)
  const opened = { ...openedAt(catalog, outermost, found), area: o.area }
  return selectionKept({ ...stage, opened }, found)
}

// 並び ids の中で id の隣に在る、残っているページ（left に在る物）: 後ろにあった物、無ければ前にあった物。id が並びに無い・どちらも無ければ undefined
function nearIn<P>(ids: readonly string[], id: string, left: ReadonlyMap<string, P>): P | undefined {
  const at = ids.indexOf(id)
  if (at < 0) return undefined
  const after = ids.slice(at + 1).find(i => left.has(i))
  const prior = ids
    .slice(0, at)
    .reverse()
    .find(i => left.has(i))
  return left.get(after ?? prior ?? "")
}

// 選択から、開いているページ shown に無くなった物を外す
function selectionKept(next: Stage, shown: Page | undefined): Stage {
  if (next.selection.length === 0) return next
  const ids = shown ? anchorIds(shown) : new Set<string>()
  const kept = next.selection.filter(id => ids.has(id))
  if (kept.length === next.selection.length) return next
  return kept.length === 0 ? { ...next, selection: NONE, editing: "none" } : { ...next, selection: kept }
}

function followOpened(catalog: CoreCatalog, stage: Stage, book: Book, before?: Book): Stage {
  const o = stage.opened
  if (o === NOTHING_OPENED || o.outermost.id !== book.id) return stage
  if (o.kind === "reference" && findReference(book, o.reference)) return stage
  const found = o.kind === "page" ? foundPage(findPage(book, o.page)) : undefined
  if (o.kind === "page" && found) return followShown(catalog, stage, o, found)
  const opened = neighbourOf(catalog, book, o, before)
  return sameData(opened, o) ? stage : settle(leave(opening(stage, opened)), ORIGIN)
}

// 開いているページ o が found に変わったときに合わせる（タイプと紙は決め直す。紙が同じで中身をずらしたなら、パンと広さを合わせる）
function followShown(catalog: CoreCatalog, stage: Stage, o: OpenedPage, found: Page): Stage {
  const paper = stagePaper(catalog, found)
  if (sameData(paper, o.paper)) {
    const was = pointOr(o.shift)
    const now = found.shift ?? ORIGIN
    const sheetNow = paperOf(stage)
    const sheet = sheetNow === NO_PAPER ? undefined : sheetNow
    if (was.x === now.x && was.y === now.y) return stage
    const dx = sheet ? (now.x - was.x) * sheet.w : 0
    const dy = sheet ? (now.y - was.y) * sheet.h : 0
    const base = o.area === NO_AREA ? sheet : o.area
    const opened: OpenedPage = {
      ...o,
      shift: shiftOf(found),
      area: base ? { w: base.w + dx, h: base.h + dy } : NO_AREA,
    }
    return settle({ ...stage, opened }, { x: stage.pan.x - dx * stage.zoom, y: stage.pan.y - dy * stage.zoom })
  }
  // 紙が変われば、プレゼンテーションが知らせた広さは捨てる（知らせ直すまで紙 1 枚）
  return settle({ ...stage, opened: openedAt(catalog, o.outermost, found) }, stage.pan)
}

// 開いていたもの was が無くなった（か、空のバインダだった）ときに開くもの:
// - 空のバインダを開いていた: バインダが残っていれば、その最初のページ（まだ空ならバインダのまま）
// - バインダの中のページを開いていた: 変わる前のブックで同じバインダの後ろにあった残りのページ、無ければ前にあった残りのページ、無ければそのバインダ（空）
// - ほか（バインダも無くなった・並びに直に入っていたページ）: 変わる前のブックで後ろにあった残りのページ、無ければ前にあった残りのページ
// どれも無ければ、並びの最初
function neighbourOf(catalog: CoreCatalog, book: Book, was: Opened, before?: Book): Opened {
  if (was.kind === "none") return openedFirst(catalog, book)
  const left = new Map(pagesOf(book).map(p => [p.id, p]))
  const near = (ids: readonly string[], id: string): Page | undefined => nearIn(ids, id, left)
  const binder = before ? binderOf(before, was) : was.kind === "binder" ? was.binder : NO_BINDER
  if (binder !== NO_BINDER && findBinder(book, binder) !== NO_BINDER) {
    const inBinder = (b: Book) => pagesIn(b, binder).map(e => e.id)
    const now = new Set(inBinder(book))
    const next =
      was.kind === "page" && before
        ? near(
            inBinder(before).filter(i => i === was.page || now.has(i)),
            was.page,
          )
        : undefined
    return next ? openedAt(catalog, entryOf(book), next) : openedIn(catalog, book, binder)
  }
  // 並びに直に入っていたページか参照エントリ: 隣のタブ（バインダの中はページごとに数える）
  const tabs = (b: Book) => lineupOf(b).flatMap(e => (e.kind === "binder" ? e.lineup.map(p => p.id) : [e.id]))
  const refs = new Map(referencesOf(book).map(r => [r.id, r]))
  const id = was.kind === "page" ? was.page : was.kind === "reference" ? was.reference : NO_PAGE
  const next =
    before && id !== NO_PAGE
      ? nearIn<Page | ReferenceEntry>(tabs(before), id, new Map<string, Page | ReferenceEntry>([...left, ...refs]))
      : undefined
  if (next && next.kind === "reference") return openedRef(book, next.id)
  return next ? openedAt(catalog, entryOf(book), next as Page) : openedFirst(catalog, book)
}

// 倍率を zoom にする。表示領域の中の点 at（無ければ真ん中）の下にある紙の点が動かないように、ずらす量を合わせる（紙が無ければ変えない）
export function zoomTo(stage: Stage, zoom: number, at?: Point): Stage {
  if (!extentOf(stage) || zoom === stage.zoom) return stage
  const view = stage.view
  if (!view) return moveTo({ ...stage, zoom }, stage.pan)
  const p = at ?? { x: view.w / 2, y: view.h / 2 }
  const origin = paperOrigin(stage.pan)
  const k = zoom / stage.zoom
  const pan = { x: stage.pan.x + (p.x - origin.x) * (1 - k), y: stage.pan.y + (p.y - origin.y) * (1 - k) }
  return moveTo({ ...stage, zoom }, pan)
}

// 開いたときの見え方に戻す: 倍率 1 で、start（中身の載った印刷区画の左上）を表示領域の左上に置く。印刷プレビューの間は、並べた広さの左上
export function resetView(stage: Stage): Stage {
  const pan = previewing(stage) ? ORIGIN : startPan(stage, 1)
  return stage.zoom === 1 ? moveTo(stage, pan) : moveTo({ ...stage, zoom: 1 }, pan)
}

// 何も開いていない状態にする（開いていたブックが無くなったときなど）
export function closeBook(stage: Stage): Stage {
  return stage.opened !== NOTHING_OPENED
    ? settle(leave({ ...edited(stage), opened: NOTHING_OPENED, start: null, starting: false }), ORIGIN)
    : stage
}

// 背景編集モードの間か（ステージが、ページの slide を背景として直している間）
export const editingBackground = (stage: Pick<Stage, "edits">): boolean => stage.edits === "slide"

// 背景編集モードに入る（背景を持つタイプのブックのページを開いていて、編集の間だけ）。置こうとしているアイテム・選択・その場の編集・道具のアイコンは捨てる
export function startBackground(catalog: CoreCatalog, stage: Stage): Stage {
  const o = openedPage(stage.opened)
  if (o === NO_PAGE || previewing(stage) || editingBackground(stage)) return stage
  const type = catalog.pageTypes.get(o.type)
  if (!type || !slideIsBackground(type)) return stage
  return leave({ ...stage, edits: "slide" })
}

// 背景編集モードを終える（置こうとしているアイテム・選択・その場の編集・道具のアイコンは捨てる）
export function endBackground(stage: Stage): Stage {
  return editingBackground(stage) ? leave({ ...stage, edits: "items" }) : stage
}

// 印刷プレビューを開く（ステージエントリを開いていて、編集の間だけ）。置こうとしているアイテム・選択・その場の編集・道具のアイコンは捨てる。
// 並べた広さをプレゼンテーションが知らせるまで、ずらす量は収めない
export function openPrintPreview(stage: Stage): Stage {
  if (stage.opened === NOTHING_OPENED || previewing(stage)) return stage
  return {
    ...leave(stopStart(stage)),
    mode: { kind: "print-preview", area: NO_AREA, back: { zoom: stage.zoom, pan: stage.pan } },
  }
}

// 印刷プレビューを閉じ、開く前の倍率とずらす量に戻す（印刷プレビューの間でなければ、同じ値を返す）
export function closePrintPreview(stage: Stage): Stage {
  if (stage.mode.kind !== "print-preview") return stage
  const { zoom, pan } = stage.mode.back
  return settle({ ...stage, mode: EDIT, zoom }, pan)
}

// 編集の間のステージ（印刷プレビューの間なら閉じ、開く前の倍率にする。ずらす量は呼ぶ側が決める）
function edited(stage: Stage): Stage {
  return stage.mode.kind === "print-preview" ? { ...stage, mode: EDIT, zoom: stage.mode.back.zoom } : stage
}

// 印刷プレビューで並べた広さを area にする（プレゼンテーションが知らせる。印刷プレビューの間でなければ、同じ値を返す）。ずらす量は範囲に収め直す
export function setPreviewArea(stage: Stage, area: Size): Stage {
  const mode = stage.mode
  if (mode.kind !== "print-preview") return stage
  if (mode.area !== NO_AREA && mode.area.w === area.w && mode.area.h === area.h) return stage
  return settle({ ...stage, mode: { ...mode, area } }, stage.pan)
}

// 参照エントリを開いているとき、描く側が知らせた描いた広さ area を持つ（描く物が無ければ null）。初めて届いたら、左上を表示領域の左上に置く
export function setReferenceArea(stage: Stage, area: Size | null): Stage {
  const o = openedReference(stage.opened)
  if (o === NO_REFERENCE) return stage
  const now = o.area === NO_AREA ? null : o.area
  if (now === area || (now && area && now.w === area.w && now.h === area.h)) return stage
  const opened: OpenedReference = { ...o, area: area ?? NO_AREA }
  const next = { ...stage, opened }
  return settle(next, now === null ? ORIGIN : stage.pan)
}

// アイテムを置こうとする。同じアイテムをもう一度選べば取り消す（道具を選択にするのは workspace.ts の togglePlacing）
export function togglePlacing(stage: Stage, item: ItemId, props: Placing["props"] = NO_PROPS): Stage {
  if (previewing(stage)) return stage
  const next: Placing = { item, props }
  return { ...stage, placing: sameData(stage.placing, next) ? NO_PLACING : next }
}

export function stopPlacing(stage: Stage): Stage {
  return stage.placing === NO_PLACING ? stage : { ...stage, placing: NO_PLACING }
}

// 道具のアイコンを開く（紙が無ければ開かない）・閉じる
export function openPicker(stage: Stage, at: Point | null): Stage {
  return paperOf(stage) !== NO_PAPER && !previewing(stage) ? { ...stage, picker: { at } } : stage
}

export function closePicker(stage: Stage): Stage {
  return stage.picker === null ? stage : { ...stage, picker: null }
}

// 選ぶ物を替える（替われば、その場の編集は終える）
export function select(stage: Stage, ids: readonly string[]): Stage {
  if (previewing(stage)) return stage
  const same = ids.length === stage.selection.length && ids.every((id, i) => stage.selection[i] === id)
  return same ? stage : { ...stage, selection: ids.length === 0 ? NONE : [...ids], editing: "none" }
}

// 選んでいる物を、その場で編集し始める・終える（何も選んでいなければ始めない）
export function setEditing(stage: Stage, editing: Editing): Stage {
  if (previewing(stage)) return stage
  const next = stage.selection.length > 0 ? editing : "none"
  return next === stage.editing ? stage : { ...stage, editing: next }
}

// 紙の置き場所（紙が無ければ NO_PAPER）
export function placement(stage: Pick<Stage, "opened" | "pan" | "zoom">): Placement | typeof NO_PAPER {
  const paper = areaOf(stage)
  if (paper === NO_PAPER) return NO_PAPER
  const origin = paperOrigin(stage.pan)
  return { x: origin.x, y: origin.y, w: paper.w, h: paper.h, zoom: stage.zoom }
}

// 表示領域の中の点（左上から）を、紙の上の点に直す（紙が無ければ NO_PAPER）
export function toPaper(stage: Pick<Stage, "opened" | "pan" | "zoom">, p: Point): Point | typeof NO_PAPER {
  const at = placement(stage)
  if (at === NO_PAPER) return NO_PAPER
  return { x: (p.x - at.x) / at.zoom, y: (p.y - at.y) / at.zoom }
}

// 画面の上で動いた量を、紙の上で動いた量に直す
export function toPaperDelta(stage: Pick<Stage, "zoom">, d: Point): Point {
  return { x: d.x / stage.zoom, y: d.y / stage.zoom }
}

// ステージが開いている物 opened（outermost は、そのステージエントリの id）の中の、id のページ: ブックならその中のページ、ブックの外のページならそのページ自身、
// ブックの外のバインダならその中のページ。開いている物に無いページ・無ければ null（プラグイン API の usePageById が読む）
export function openedPageById(from: LibraryAndBooks, opened: { outermost: string }, id: string): ItemPage | null {
  const book = from.books[opened.outermost]
  if (book) return foundPage(findPage(book, id)) ?? null
  if (opened.outermost === id) return pageIn(from.pages, id) ?? null
  return outsideBinderIn(from, opened.outermost)?.lineup.find(p => p.id === id) ?? null
}
