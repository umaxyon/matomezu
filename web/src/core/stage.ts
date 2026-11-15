// ステージ: 画面の見える領域の 1 つ。ブックを 1 つ開くか、何も開いていない。ページを持つタイプのブックはページを 1 つ開き
// （ページが無ければ開かない）、開いたページの紙を置く。表示領域の大きさ・倍率・ずらす量と、置こうとしているアイテム・選択を持つ
// （道具はステージではなく、道具の組ごとに窓が持つ。core/tools.ts）。
// ずらす量は、いつも範囲に収めた値で持つ（収めるのはここの操作だけで、描く側は直さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを返す）

import { anchorIds } from "./annotation"
import { findFolder, findPage, lineupOf, pagesOf } from "./book"
import type { ItemId } from "./catalog"
import type { CoreCatalog, PageTypeId } from "./core-catalog"
import { isOnBook } from "./def/action"
import { type EditList, slideIsBackground } from "./def/page-type"
import type { Point, Size } from "./geom"
import { type PaperChoice, type ResolvedPaper, resolvePaper } from "./paper"
import { sameData } from "./same"
import type { Book, Page } from "./schema/book"
import { clampPan, contentSize, paperOrigin } from "./viewport"

// 開いているブックと、その中で開いているもの。開いているものは 3 通り:
// - none: 何も開いていない（ページが 1 枚も無いブック）
// - folder: 空のフォルダ（中のページが 1 枚も無い。type はフォルダが入れるページのタイプ）
// - page: ページ。ページのタイプと、描く紙を写して持つ（開くときと、ブックが変わったときに決め直す）。
//   area は、見せ方が描く広さ（可変ページで、印刷区画を並べた広さ）。見せ方が知らせるまでと、紙 1 枚で描くページでは持たない。
//   shift は、開いたページの中身をずらした量（ページの shift を写す。変わったらパンを合わせる）。
//   origin は、位置をデータに持たない見せ方が、描く中身を右・下へずらした量（印刷区画の数。見せ方が広さと一緒に知らせる。変わったらパンを合わせる）
// ページが入っているフォルダは持たない（ブックから引く。core/book.ts の findPage）
export type Opened = OpenedNone | OpenedFolder | OpenedPage
interface OpenedBook {
  book: string // ブックの id
}
export interface OpenedNone extends OpenedBook {
  kind: "none"
}
export interface OpenedFolder extends OpenedBook {
  kind: "folder"
  folder: string // フォルダの id
  type: PageTypeId
}
export interface OpenedPage extends OpenedBook {
  kind: "page"
  page: string // 開いているページの id
  type: PageTypeId
  paper: ResolvedPaper | null // 描く紙（見せ方が紙を置かなければ null）
  area?: Size
  shift?: Point
  origin?: Point
}

// ページを開いていれば、その開いているもの（開いていなければ null）
export const openedPage = (opened: Opened | null): OpenedPage | null => (opened?.kind === "page" ? opened : null)
// 開いているページの id（ページを開いていなければ null）
export const shownPageId = (opened: Opened | null): string | null => openedPage(opened)?.page ?? null
// 開いているページのタイプ（空のフォルダを開いていれば、フォルダが入れるタイプ。どちらでもなければ null）
export const shownType = (opened: Opened | null): PageTypeId | null =>
  opened && opened.kind !== "none" ? opened.type : null

// ページ page の紙を、ステージに置く紙に決める（タイプ type の見せ方が紙を置かなければ null）
function stagePaper(catalog: CoreCatalog, page: PaperChoice & Pick<Page, "type">): ResolvedPaper | null {
  const presentation = catalog.presentations.get(catalog.pageTypes.get(page.type)?.presentation ?? "")
  return presentation?.paper === false ? null : resolvePaper(catalog, page)
}

// ページの中身をずらした量（印刷区画の数。ずらしていなければ持たない）
const shiftOf = (page: Page | undefined): { shift?: Point } => (page?.shift ? { shift: page.shift } : {})

// ステージの見え方: 開いたページを編集するか、印刷プレビュー（開いたブックの全ページの印刷区画を並べて、見るだけ）か。
// 印刷プレビューの間、ずらす量と倍率は並べた広さ area（見せ方が知らせるまでは持たない）で決め、開く前の倍率とずらす量 back を閉じたときに戻す。
// 開いたページはそのまま持つ（閉じたらそのページの編集に戻る）
export type StageMode = { kind: "edit" } | { kind: "print-preview"; area?: Size; back: { zoom: number; pan: Point } }

// 置こうとしている物: アイテムと、置くときに渡す項目の値（無ければ、アイテムの既定の項目で置く）
export interface Placing {
  item: ItemId
  props?: Readonly<Record<string, unknown>>
}

export interface Stage {
  id: string
  opened: Opened | null // 何も開いていなければ null
  mode: StageMode
  zoom: number
  pan: Point // ずらす量（viewport.ts）
  view: Size | null // 表示領域の大きさ（測るまでは null）
  // 直している並び: ページの items か、背景（ページの slide。背景を持つタイプの、背景編集モードの間）。開くページやブックが替わると items に戻る
  edits: EditList
  placing: Placing | null // 置こうとしている物（ツールボックスなどで選んだもの。置くか取り消すまで）
  selection: readonly string[] // 選んでいる物の id（開いているページのアイテムや、ページのフィールドの中の物）
  // 選んでいる物を、今その場で編集中か（選びが替わる・開くものが変わる・道具を替えると終わる）。
  // 何をしているかをプラグインが名前で分けるときは、その名前（種類を選ぶなど。true は名前を分けない編集）
  editing: boolean | string
  // 開いている道具のアイコン（at は出す所の画面の座標。null なら画面が決める）
  picker: { at: Point | null } | null
  // 初めの位置で表示領域の左上に置く紙の点（中身の載った印刷区画の左上。ビューが知らせる。開くたびに捨て、知らせるまでは null で紙の左上）
  start: Point | null
  // 開いてから、まだ利用者もコマンドも見え方を動かしておらず、初めの位置に合わせ終えていないか（start と広さが届いたら合わせて下ろす）
  starting: boolean
}

// 紙を置く位置（表示領域の左上から）と、倍率をかける前の大きさ（可変ページは、見せ方が知らせた広さ。areaOf）
export interface Placement {
  x: number
  y: number
  w: number
  h: number
  zoom: number
}

const HOME: Point = { x: 0, y: 0 }
const NONE: readonly string[] = []
const EDIT: StageMode = { kind: "edit" }

export function newStage(id: string, opened: Opened | null = null): Stage {
  return {
    id,
    opened,
    mode: EDIT,
    zoom: 1,
    pan: HOME,
    view: null,
    edits: "items",
    placing: null,
    selection: NONE,
    editing: false,
    picker: null,
    start: null,
    starting: false,
  }
}

// 開くものが変わったときに、置こうとしているアイテムと選択を捨て（その場の編集も終える）、道具のアイコンを閉じる
function leave(stage: Stage): Stage {
  if (stage.placing === null && stage.selection.length === 0 && stage.picker === null && !stage.editing) return stage
  return { ...stage, placing: null, selection: NONE, editing: false, picker: null }
}

// ステージに出す紙の大きさ（ページを開いていないか、描けない紙か、見せ方が紙を置かないなら null）
export function paperOf(stage: Pick<Stage, "opened">): Size | null {
  const paper = openedPage(stage.opened)?.paper
  return paper && paper.status !== "unshowable" ? paper.size : null
}

// ステージに描く広さ（見せ方が知らせた広さ。無ければ紙 1 枚。紙が無ければ null）。ずらす量の範囲・紙の枠の大きさ・全体を収める倍率は、これで決める
export function areaOf(stage: Pick<Stage, "opened">): Size | null {
  const paper = paperOf(stage)
  return paper && (openedPage(stage.opened)?.area ?? paper)
}

// ずらす量の範囲・全体を収める倍率を決める広さ: 印刷プレビューの間は並べた広さ（知らせるまでは null）、ほかは areaOf
export function extentOf(stage: Pick<Stage, "opened" | "mode">): Size | null {
  return stage.mode.kind === "print-preview" ? (stage.opened && stage.mode.area) || null : areaOf(stage)
}

// 印刷プレビューの間か（間は、選ぶ・置く・その場の編集・道具のアイコンを始めず、ブックを変えるアクションを止める。stageBlocks）
export const previewing = (stage: Pick<Stage, "mode">): boolean => stage.mode.kind === "print-preview"

// 見え方が mode のステージから行うと止めるアクションか: 印刷プレビューの間の、ブックが対象のアクション（印刷プレビューの間も行う印
// inPrintPreview のあるものを除く）。止めるのはそのステージから行う物だけで、AI やほかのステージは止めない
export function stageBlocks(catalog: CoreCatalog, mode: StageMode["kind"], action: string): boolean {
  const def = catalog.actions.get(action)
  return mode === "print-preview" && isOnBook(def?.target) && def?.inPrintPreview !== "runs"
}

// 見せ方が描く広さを area に、描く中身をずらした量を origin にする（null なら紙 1 枚に戻し、ずらさない）。origin が変わったら、
// 中身が画面の同じ所に見えるよう、変わった分だけパンを合わせる。ずらす量は範囲に収め直す
export function setArea(stage: Stage, area: Size | null, origin: Point | null = null): Stage {
  const o = openedPage(stage.opened)
  const sheet = paperOf(stage)
  if (!o || !sheet) return stage
  const now = o.area ?? null
  const was = o.origin ?? HOME
  const next = area ? (origin ?? HOME) : HOME
  const sameArea = now === area || (now && area && now.w === area.w && now.h === area.h)
  if (sameArea && was.x === next.x && was.y === next.y) return stage
  const { area: _, origin: __, ...rest } = o
  const opened = {
    ...rest,
    ...(area ? { area } : {}),
    ...(next.x !== 0 || next.y !== 0 ? { origin: next } : {}),
  }
  const dx = (next.x - was.x) * sheet.w * stage.zoom
  const dy = (next.y - was.y) * sheet.h * stage.zoom
  return reachStart(settle({ ...stage, opened }, { x: stage.pan.x - dx, y: stage.pan.y - dy }))
}

// 初めの位置で表示領域の左上に置く紙の点を start にする（ビューが知らせる）。開いたばかりなら、初めの位置に合わせる
export function setStart(stage: Stage, start: Point): Stage {
  const was = stage.start
  if (!stage.opened || (was && was.x === start.x && was.y === start.y)) return stage
  return reachStart({ ...stage, start })
}

// 倍率 zoom で、start が表示領域の左上に来るずらす量（知らせる前は紙の左上）
function startPan(stage: Stage, zoom: number): Point {
  const s = stage.start ?? HOME
  return { x: 0 - s.x * zoom, y: 0 - s.y * zoom }
}

// 開いたばかり（starting）で start が届いていれば、初めの位置に合わせて印を下ろす。紙の左上でない start は、見せ方の広さが届くまで待つ
// （届く前は紙 1 枚の範囲に収めてしまう）
function reachStart(stage: Stage): Stage {
  const s = stage.start
  if (!stage.starting || !s) return stage
  if ((s.x !== 0 || s.y !== 0) && !openedPage(stage.opened)?.area) return stage
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
  return { ...stage, opened, edits: "items", start: null, starting: opened.kind === "page" && opened.paper !== null }
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

// ブック book のページ page を開いた形（タイプ・紙・ずらした量はページから写す）
export function openedAt(catalog: CoreCatalog, book: Pick<Book, "id">, page: Page): OpenedPage {
  return {
    kind: "page",
    book: book.id,
    page: page.id,
    type: page.type as PageTypeId,
    paper: stagePaper(catalog, page),
    ...shiftOf(page),
  }
}

// ブック book の、並びの最初を開いた形: 最初がページならそのページ、フォルダならその最初のページ（空のフォルダならフォルダ）。並びが空なら何も開かない
function openedFirst(catalog: CoreCatalog, book: Book): Opened {
  const [first] = lineupOf(book)
  if (!first) return { kind: "none", book: book.id }
  return first.kind === "page" ? openedAt(catalog, book, first.page) : openedIn(catalog, book, first.id)
}

// ブック book のフォルダ folder を開いた形: 中の最初のページ（空なら、フォルダ。フォルダが無ければ何も開かない）
function openedIn(catalog: CoreCatalog, book: Book, folder: string): Opened {
  const found = findFolder(book, folder)
  if (!found) return { kind: "none", book: book.id }
  const [first] = found.lineup
  return first
    ? openedAt(catalog, book, first.page)
    : { kind: "folder", book: book.id, folder: found.id, type: found.pageType as PageTypeId }
}

// ブックを開く（並びの最初）。ずらす量は紙の左上に戻し（初めの位置 start が届いたらそこへ合わせる。starting）、印刷プレビューは閉じる（開く前の倍率に戻す）
export function openBook(catalog: CoreCatalog, stage: Stage, book: Book): Stage {
  return settle(leave(opening(edited(stage), openedFirst(catalog, book))), HOME)
}

// 開いているブックのページを開く（開いているブックの、あるページだけ）。ずらす量は紙の左上に戻す（初めの位置が届いたらそこへ合わせる）。
// 印刷プレビューの間なら閉じて、そのページの編集にする（開いていたページなら、閉じるのと同じ）
export function openPage(catalog: CoreCatalog, stage: Stage, book: Book, page: string): Stage {
  const o = stage.opened
  const found = findPage(book, page)?.page
  if (!o || o.book !== book.id || !found) return stage
  if (shownPageId(o) === page) return closePrintPreview(stage)
  if (editingBackground(stage)) return stage // 背景編集モードの間は、ページを替えない
  return settle(leave(opening(edited(stage), openedAt(catalog, book, found))), HOME)
}

// 開いているブックのフォルダを開く（中の最初のページ。空ならフォルダ）。そのフォルダのページか、そのフォルダをもう開いていれば、印刷プレビューを閉じるだけ
export function openFolder(catalog: CoreCatalog, stage: Stage, book: Book, folder: string): Stage {
  const o = stage.opened
  if (!o || o.book !== book.id || !findFolder(book, folder)) return stage
  if (folderOf(book, o) === folder) return closePrintPreview(stage)
  if (editingBackground(stage)) return stage
  return settle(leave(opening(edited(stage), openedIn(catalog, book, folder))), HOME)
}

// 開いているものが入っているフォルダの id（空のフォルダを開いていればそのフォルダ。フォルダの外のページか、何も開いていなければ null）
export function folderOf(book: Book, opened: Opened | null): string | null {
  if (opened?.kind === "folder") return opened.folder
  return opened?.kind === "page" ? (findPage(book, opened.page)?.folder?.id ?? null) : null
}

// 開いているブックが変わったときに合わせる。開いていたページが残っていればそのページ（タイプと紙は決め直す）、
// 無くなっていれば隣（下の neighbourOf）。空のフォルダを開いていて、フォルダにページが入ったら、その最初のページ。
// 開くものが変わったときだけ、ずらす量を紙の左上に戻し（初めの位置が届いたらそこへ合わせる）、選択を捨てる。同じページで紙も同じまま中身をずらした（ページの shift が変わった）なら、
// 中身が画面の同じ所に見えるよう、ずらした分だけパンを合わせ、見せ方が知らせた広さもその分だけ先に変える（知らせ直す前に範囲に収め直して打ち消さないように）。
// 選択からは、ブックに無くなった物（AI やほかの画面が消した物、Undo で無くなった物）を外す。
// そのブックを開いていなければ、同じ値を返す
export function followBook(catalog: CoreCatalog, stage: Stage, book: Book, before?: Book): Stage {
  const next = followOpened(catalog, stage, book, before)
  if (next.selection.length === 0 || next.opened?.book !== book.id) return next
  const ids = anchorIds(book)
  const kept = next.selection.filter(id => ids.has(id))
  if (kept.length === next.selection.length) return next
  return kept.length === 0 ? { ...next, selection: NONE, editing: false } : { ...next, selection: kept }
}

function followOpened(catalog: CoreCatalog, stage: Stage, book: Book, before?: Book): Stage {
  const o = stage.opened
  if (!o || o.book !== book.id) return stage
  const found = o.kind === "page" ? findPage(book, o.page)?.page : undefined
  if (o.kind === "page" && found) {
    const paper = stagePaper(catalog, found)
    if (sameData(paper, o.paper)) {
      const was = o.shift ?? HOME
      const now = found.shift ?? HOME
      const sheet = paperOf(stage)
      if (was.x === now.x && was.y === now.y) return stage
      const { shift: _, area, ...rest } = o
      const dx = sheet ? (now.x - was.x) * sheet.w : 0
      const dy = sheet ? (now.y - was.y) * sheet.h : 0
      const base = area ?? sheet
      const opened = {
        ...rest,
        ...shiftOf(found),
        ...(base ? { area: { w: base.w + dx, h: base.h + dy } } : {}),
      }
      return settle({ ...stage, opened }, { x: stage.pan.x - dx * stage.zoom, y: stage.pan.y - dy * stage.zoom })
    }
    // 紙が変われば、見せ方が知らせた広さは捨てる（知らせ直すまで紙 1 枚）
    return settle({ ...stage, opened: openedAt(catalog, book, found) }, stage.pan)
  }
  const opened = neighbourOf(catalog, book, o, before)
  return sameData(opened, o) ? stage : settle(leave(opening(stage, opened)), HOME)
}

// 開いていたもの was が無くなった（か、空のフォルダだった）ときに開くもの:
// - 空のフォルダを開いていた: フォルダが残っていれば、その最初のページ（まだ空ならフォルダのまま）
// - フォルダの中のページを開いていた: 変わる前のブックで同じフォルダの後ろにあった残りのページ、無ければ前にあった残りのページ、無ければそのフォルダ（空）
// - ほか（フォルダも無くなった・並びに直に入っていたページ）: 変わる前のブックで後ろにあった残りのページ、無ければ前にあった残りのページ
// どれも無ければ、並びの最初
function neighbourOf(catalog: CoreCatalog, book: Book, was: Opened, before?: Book): Opened {
  if (was.kind === "none") return openedFirst(catalog, book)
  const left = new Map(pagesOf(book).map(p => [p.id, p]))
  const near = (ids: readonly string[], id: string): Page | undefined => {
    const at = ids.indexOf(id)
    if (at < 0) return undefined
    const after = ids.slice(at + 1).find(i => left.has(i))
    const prior = ids
      .slice(0, at)
      .reverse()
      .find(i => left.has(i))
    return left.get(after ?? prior ?? "")
  }
  const folder = before ? folderOf(before, was) : was.kind === "folder" ? was.folder : null
  if (folder !== null && findFolder(book, folder)) {
    const inFolder = (b: Book) => (findFolder(b, folder)?.lineup ?? []).map(e => e.page.id)
    const now = new Set(inFolder(book))
    const next =
      was.kind === "page" && before
        ? near(
            inFolder(before).filter(i => i === was.page || now.has(i)),
            was.page,
          )
        : undefined
    return next ? openedAt(catalog, book, next) : openedIn(catalog, book, folder)
  }
  const next =
    was.kind === "page" && before
      ? near(
          pagesOf(before).map(p => p.id),
          was.page,
        )
      : undefined
  return next ? openedAt(catalog, book, next) : openedFirst(catalog, book)
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
  const pan = previewing(stage) ? HOME : startPan(stage, 1)
  return stage.zoom === 1 ? moveTo(stage, pan) : moveTo({ ...stage, zoom: 1 }, pan)
}

// 何も開いていない状態にする（開いていたブックが無くなったときなど）
export function closeBook(stage: Stage): Stage {
  return stage.opened ? settle(leave({ ...edited(stage), opened: null, start: null, starting: false }), HOME) : stage
}

// 背景編集モードの間か（ステージが、ページの slide を背景として直している間）
export const editingBackground = (stage: Pick<Stage, "edits">): boolean => stage.edits === "slide"

// 背景編集モードに入る（背景を持つタイプのブックのページを開いていて、編集の間だけ）。置こうとしているアイテム・選択・その場の編集・道具のアイコンは捨てる
export function startBackground(catalog: CoreCatalog, stage: Stage): Stage {
  const o = openedPage(stage.opened)
  if (!o || previewing(stage) || editingBackground(stage)) return stage
  const type = catalog.pageTypes.get(o.type)
  if (!type || !slideIsBackground(type)) return stage
  return leave({ ...stage, edits: "slide" })
}

// 背景編集モードを終える（置こうとしているアイテム・選択・その場の編集・道具のアイコンは捨てる）
export function endBackground(stage: Stage): Stage {
  return editingBackground(stage) ? leave({ ...stage, edits: "items" }) : stage
}

// 印刷プレビューを開く（ブックを開いていて、編集の間だけ）。置こうとしているアイテム・選択・その場の編集・道具のアイコンは捨てる。
// 並べた広さを見せ方が知らせるまで、ずらす量は収めない
export function openPrintPreview(stage: Stage): Stage {
  if (!stage.opened || previewing(stage)) return stage
  return { ...leave(stopStart(stage)), mode: { kind: "print-preview", back: { zoom: stage.zoom, pan: stage.pan } } }
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

// 印刷プレビューで並べた広さを area にする（見せ方が知らせる。印刷プレビューの間でなければ、同じ値を返す）。ずらす量は範囲に収め直す
export function setPreviewArea(stage: Stage, area: Size): Stage {
  const mode = stage.mode
  if (mode.kind !== "print-preview") return stage
  if (mode.area && mode.area.w === area.w && mode.area.h === area.h) return stage
  return settle({ ...stage, mode: { ...mode, area } }, stage.pan)
}

// アイテムを置こうとする。同じアイテムをもう一度選べば取り消す（道具を選択にするのは workspace.ts の togglePlacing）
export function togglePlacing(stage: Stage, item: ItemId, props?: Placing["props"]): Stage {
  if (previewing(stage)) return stage
  const next: Placing = props ? { item, props } : { item }
  return { ...stage, placing: sameData(stage.placing, next) ? null : next }
}

export function stopPlacing(stage: Stage): Stage {
  return stage.placing === null ? stage : { ...stage, placing: null }
}

// 道具のアイコンを開く（紙が無ければ開かない）・閉じる
export function openPicker(stage: Stage, at: Point | null): Stage {
  return paperOf(stage) && !previewing(stage) ? { ...stage, picker: { at } } : stage
}

export function closePicker(stage: Stage): Stage {
  return stage.picker === null ? stage : { ...stage, picker: null }
}

// 選ぶ物を替える（替われば、その場の編集は終える）
export function select(stage: Stage, ids: readonly string[]): Stage {
  if (previewing(stage)) return stage
  const same = ids.length === stage.selection.length && ids.every((id, i) => stage.selection[i] === id)
  return same ? stage : { ...stage, selection: ids.length === 0 ? NONE : [...ids], editing: false }
}

// 選んでいる物を、その場で編集し始める・終える（何も選んでいなければ始めない）
export function setEditing(stage: Stage, editing: boolean | string): Stage {
  if (previewing(stage)) return stage
  const next = stage.selection.length > 0 ? editing : false
  return next === stage.editing ? stage : { ...stage, editing: next }
}

// 紙の置き場所（何も開いていなければ null）
export function placement(stage: Pick<Stage, "opened" | "pan" | "zoom">): Placement | null {
  const paper = areaOf(stage)
  if (!paper) return null
  const origin = paperOrigin(stage.pan)
  return { x: origin.x, y: origin.y, w: paper.w, h: paper.h, zoom: stage.zoom }
}

// 表示領域の中の点（左上から）を、紙の上の点に直す（紙が無ければ null）
export function toPaper(stage: Pick<Stage, "opened" | "pan" | "zoom">, p: Point): Point | null {
  const at = placement(stage)
  if (!at) return null
  return { x: (p.x - at.x) / at.zoom, y: (p.y - at.y) / at.zoom }
}

// 画面の上で動いた量を、紙の上で動いた量に直す
export function toPaperDelta(stage: Pick<Stage, "zoom">, d: Point): Point {
  return { x: d.x / stage.zoom, y: d.y / stage.zoom }
}
