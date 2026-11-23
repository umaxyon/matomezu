// 画面の場所: 見ているもの（窓の状態 window.ts）のうち、読み直しても戻したいもの。開いているスクリーンの並び（1 枚ごとの id・定義の id・渡された値）とカレントにした順、
// ステージを並べるスクリーンの、ステージごとに開いているブックとページ・倍率・ずらす量（印刷プレビューの間は、閉じたときに戻す編集の倍率とずらす量。
// 印刷プレビューの間かは入れず、読み直すと編集に戻る）・カレントのステージ・分けている境目の割合と、場所に入れるプラグイン状態（窓・スクリーン・ステージの範囲。
// 中身は読まずに運ぶ。どれを入れるか・形を確かめるのは store）。
// 選択・置こうとしているアイテム・道具は入れない（その場の操作の途中の状態のため）。
// ホストがこれを外（ブラウザの URL など）に写し、外から戻すときに当てはめる。操作はデータを書き換えず、新しい値を返す

import type { CoreCatalog } from "./core-catalog"
import { arrangementValueOf } from "./def/screen-arrangement"
import type { Library } from "./folders"
import { NO_OUTERMOST, outermostOf, outsideBinderIn, outsidePageIn } from "./folders-tree"
import type { Point } from "./geom"
import type { ItemPage } from "./placed"
import { sameData } from "./same"
import type { BinderEntry, Book } from "./schema/book"
import {
  newStage,
  openBinder,
  openBook,
  openOutsideBinder,
  openOutsidePage,
  openPage,
  panBy,
  type Stage,
  shownPageId,
  stopStart,
} from "./stage"
import { zoomInRange } from "./viewport"
import {
  mapScreens,
  NO_SCREEN_DEF,
  type OpenedScreen,
  recentBookScreen,
  type WindowState,
  withinLimits,
} from "./window"
import { MAX_STAGES, MIN_SHARE, newWorkspace, type Workspace } from "./workspace"

export interface StagePlace {
  outermost: string // 開いているブックの id（何も開いていないか、ブックの外のページ・バインダを開いていれば NO_OUTERMOST）
  page: string | null // 開いているページの id（outermost が NO_OUTERMOST なら、ブックの外のページか、ブックの外のバインダの中のページ）
  binder: string | null // 空のバインダを開いているときの、バインダの id（ページを開いていれば null）
  zoom: number
  pan: Point
  states: Readonly<Record<string, unknown>> // 画面の場所に入れる、ステージの範囲のプラグイン状態（宣言の id → 値。store/plugin-state.ts）
}

// ステージを並べるスクリーンの中の場所
export interface StagesPlace {
  places: readonly StagePlace[] // 左から順
  current: number // カレントのステージの、左からの番号
  share: number // 分けている境目の割合（左のステージの幅）
}

// 開いているスクリーン 1 枚の場所
export interface ScreenPlace {
  id: string // 開いた 1 枚ごとの id
  def: string // スクリーンの定義の id
  props: unknown // 渡された値
  states: Readonly<Record<string, unknown>> // 画面の場所に入れる、スクリーンの範囲のプラグイン状態（宣言の id → 値）
  stages?: StagesPlace // ステージを並べるスクリーンの中
}

export interface Address {
  screens: readonly ScreenPlace[] // 開いた順（空なら、窓のスクリーンは今のまま）
  order: readonly string[] // スクリーンの id を、カレントにした順に並べた物（最後がカレントスクリーン）
  arrangement: string // スクリーンアレンジメントの定義の id
  arrangementValue: unknown // スクリーンアレンジメントの値（形は当てはめるときに確かめる）
  window: Readonly<Record<string, unknown>> // 画面の場所に入れる、窓の範囲のプラグイン状態（宣言の id → 値）
}

const NO_STATES = (): Readonly<Record<string, unknown>> => ({})

// 見ているものの場所。stageStates はステージの id ごと、screenStates はスクリーンの id ごとの、画面の場所に入れるプラグイン状態
export function addressOf(
  win: WindowState,
  stageStates: (stage: string) => Readonly<Record<string, unknown>> = NO_STATES,
  windowValues: Readonly<Record<string, unknown>> = {},
  screenStates: (screen: string) => Readonly<Record<string, unknown>> = NO_STATES,
): Address {
  return {
    screens: win.screens.map(s => ({
      id: s.id,
      def: s.def,
      props: s.props,
      states: screenStates(s.id),
      ...(s.stages ? { stages: stagesPlaceOf(s.stages, stageStates) } : {}),
    })),
    order: win.order,
    arrangement: win.arrangement,
    arrangementValue: win.arrangementValue,
    window: windowValues,
  }
}

function stagesPlaceOf(ws: Workspace, states: (stage: string) => Readonly<Record<string, unknown>>): StagesPlace {
  return {
    places: ws.stages.map(s => {
      const view = s.mode.kind === "print-preview" ? s.mode.back : s
      return {
        outermost: s.opened?.outermost.kind === "book" ? s.opened.outermost.id : NO_OUTERMOST,
        page: shownPageId(s.opened),
        binder: s.opened?.kind === "binder" ? s.opened.binder : null,
        zoom: view.zoom,
        pan: view.pan,
        states: states(s.id),
      }
    }),
    current: Math.max(
      0,
      ws.stages.findIndex(s => s.id === ws.current),
    ),
    share: ws.arrangement.share,
  }
}

// 場所 address の、カレントスクリーンの id（無ければ undefined）
export const currentIn = (address: Address): string | undefined => address.order[address.order.length - 1]

// 場所 address の、いちばん最近カレントにした、ステージを並べるスクリーン（無ければ undefined）
export function recentStagesIn(address: Address): ScreenPlace | undefined {
  for (let i = address.order.length - 1; i >= 0; i--) {
    const s = address.screens.find(x => x.id === address.order[i])
    if (s?.stages) return s
  }
  return address.screens.find(s => s.stages)
}

// 場所 address の、ブックスクリーン（いちばん最近カレントにした、ステージを並べるスクリーン）のステージの並び（無ければ空）
export const stagePlacesOf = (address: Address): readonly StagePlace[] => recentStagesIn(address)?.stages?.places ?? []

// 場所 address の、ブックスクリーンのステージの並びを places にした場所（current を渡せば、カレントの番号も替える。ブックスクリーンが無ければ同じ場所）
export function withStagePlaces(address: Address, places: readonly StagePlace[], current?: number): Address {
  const book = recentStagesIn(address)
  if (!book?.stages) return address
  const stages = { ...book.stages, places, ...(current === undefined ? {} : { current }) }
  return { ...address, screens: address.screens.map(s => (s.id === book.id ? { ...s, stages } : s)) }
}

// 移動したか: 開いているスクリーン（id・定義・渡された値）か、カレントスクリーンか、スクリーンアレンジメントかその値か、どれかのスクリーンのステージの数か、どれかのステージのブック・ページが違う、
// または積むと宣言したプラグイン状態（pushes: 宣言の id）の値が違う
// （倍率・ずらす量・カレント・境目と、積むと宣言していないプラグイン状態だけの違いは移動ではない）
export function moved(a: Address, b: Address, pushes: ReadonlySet<string> = new Set()): boolean {
  if (currentIn(a) !== currentIn(b) || a.screens.length !== b.screens.length || a.arrangement !== b.arrangement)
    return true
  if (!sameData(a.arrangementValue, b.arrangementValue)) return true
  if ([...pushes].some(id => !sameData(a.window[id], b.window[id]))) return true
  return a.screens.some((s, i) => {
    const t = b.screens[i]
    if (!t || s.id !== t.id || s.def !== t.def || !sameData(s.props, t.props)) return true
    if ([...pushes].some(id => !sameData(s.states[id], t.states[id]))) return true
    const x = s.stages?.places ?? []
    const y = t.stages?.places ?? []
    return (
      x.length !== y.length ||
      x.some(
        (p, j) =>
          p.outermost !== y[j]?.outermost ||
          p.page !== y[j]?.page ||
          [...pushes].some(id => !sameData(p.states[id], y[j]?.states[id])),
      )
    )
  })
}

// 場所 place が、書庫 library で開けるブックの外のページか、開けるブックの外のバインダの中のページを名指していれば、そのページか、そのバインダ
// （ブックを名指す場所・ページを名指さない場所は undefined）
function outsideAt(library: Library, place: StagePlace): ItemPage | BinderEntry | undefined {
  if (place.outermost !== NO_OUTERMOST || place.page === null) return undefined
  const o = outermostOf(library, place.page)
  if (o === NO_OUTERMOST || o.kind === "book") return undefined
  return o.kind === "page" ? outsidePageIn(library, o.id) : outsideBinderIn(library, o.id)
}

// ブックを名指さずページを名指す場所 place の、そのページが書庫 library でブックの中に在れば、そのブックを名指す場所（ブックの外のページだった物が、ブックの中へ移されたあと）。
// ほかは place のまま
function inBookNow(library: Library, place: StagePlace): StagePlace {
  if (place.outermost !== NO_OUTERMOST || place.page === null) return place
  const o = outermostOf(library, place.page)
  return o !== NO_OUTERMOST && o.kind === "book" ? { ...place, outermost: o.id } : place
}

// ステージ stage に、場所 place を当てはめる（ブックもページも名指さない場所は何も開かず、ブックを名指さずページを名指す場所は、ブックの外のページか、そのページを入れているブックの外のバインダを開く。
// ブックの無いページは開かず、開けたものに倍率とずらす量を戻す。ステージが開いていたページをそのまま開くなら、広さ area と origin は保つ）
function placed(
  catalog: CoreCatalog,
  books: Readonly<Record<string, Book>>,
  library: Library,
  stage: Stage,
  place: StagePlace,
): Stage {
  const book = place.outermost === NO_OUTERMOST ? undefined : books[place.outermost]
  const outside = outsideAt(library, place)
  // 表示領域の大きさ（URL には書かない）はステージのまま
  const fresh = { ...newStage(stage.id), view: stage.view }
  if (!book && !outside) return fresh
  let next = fresh
  if (book) {
    next = openBook(catalog, next, book)
    if (place.page !== null) next = openPage(catalog, next, book, place.page)
    else if (place.binder !== null) next = openBinder(catalog, next, book, place.binder)
  } else if (outside?.kind === "page") next = openOutsidePage(catalog, next, outside)
  else if (outside) next = openOutsideBinder(catalog, next, outside, place.page ?? undefined)
  // 開いていたページをそのまま開くなら、プレゼンテーションが知らせた広さとずらした量を保つ（同じ値は知らせ直されない）
  const [was, now] = [stage.opened, next.opened]
  if (was?.kind === "page" && now?.kind === "page" && was.page === now.page && was.outermost.id === now.outermost.id)
    next = {
      ...next,
      opened: { ...now, ...(was.area ? { area: was.area } : {}), ...(was.origin ? { origin: was.origin } : {}) },
    }
  // ずらす量は、ほかの操作と同じく範囲に収める（表示領域を測るまでは収めない）。初めの位置には合わせない（場所のずらす量が 0 のときも）
  const zoomed = { ...stopStart(next), zoom: zoomInRange(place.zoom) }
  return panBy(zoomed, place.pan.x - zoomed.pan.x, place.pan.y - zoomed.pan.y)
}

// 窓 win に場所 address を当てはめる。場所のスクリーンを、その id のまま開く（同じ id・同じ定義のスクリーンが開いていれば、その中を使い回す。
// 機能台帳に無い定義・形に合わない渡す値・c と番号でない id のスクリーンは開かない）。場所に無いスクリーンは閉じる（最初から開いているスクリーンと、
// ステージを並べるスクリーンが場所に 1 枚も無ければ、今のうちいちばん最近カレントにした 1 枚を、後ろに残す）。カレントにした順は場所のとおり。
// ステージを並べるスクリーンのステージは、左から同じ番号のものを使い回し、足りなければ足す（MAX_STAGES まで）。無いブック・書庫 library で開けないブックの外のページを名指すステージは開かず（全部がそうなら、そのスクリーンも開かない）。
// 場所にステージが無ければ、そのスクリーンのステージは今のまま。場所にスクリーンが無ければ、窓は今のまま。プラグイン状態は当てはめない（store の locate が当てはめる）
export function placeAt(
  catalog: CoreCatalog,
  books: Readonly<Record<string, Book>>,
  library: Library,
  win: WindowState,
  address: Address,
): WindowState {
  if (address.screens.length === 0) return win
  let issued = win.issued
  let issuedScreens = win.issuedScreens
  const screens: OpenedScreen[] = []
  for (const place of address.screens) {
    const def = catalog.screens.get(place.def)
    if (!def && place.def !== NO_SCREEN_DEF) continue
    const props = def ? def.props.safeParse(place.props) : { success: true as const, data: place.props }
    if (!props.success || !/^c[1-9]\d*$/.test(place.id) || screens.some(s => s.id === place.id)) continue
    issuedScreens = Math.max(issuedScreens, Number(place.id.slice(1)))
    const was = win.screens.find(s => s.id === place.id && s.def === place.def)
    if (!(def ? def.stages === true : true)) {
      screens.push({ id: place.id, def: place.def, props: props.data })
      continue
    }
    // 無いブック・開けないブックの外のページを名指すステージは開かない（開いていた物が無くなったときと同じ）。全部がそうなら、そのスクリーンも開かない
    const named = (place.stages?.places ?? []).slice(0, MAX_STAGES).map(p => inBookNow(library, p))
    const places = named.filter(p =>
      p.outermost !== NO_OUTERMOST
        ? books[p.outermost] !== undefined
        : p.page === null || outsideAt(library, p) !== undefined,
    )
    if (named.length > 0 && places.length === 0) continue
    if (places.length === 0) {
      const kept = was?.stages ?? newWorkspace(catalog, null, `s${++issued}`)
      screens.push({ id: place.id, def: place.def, props: props.data, stages: kept })
      continue
    }
    const base = was?.stages
    const stages = places.map((p, i) => placed(catalog, books, library, base?.stages[i] ?? newStage(`s${++issued}`), p))
    const wanted = named[Math.min(Math.max(0, place.stages?.current ?? 0), named.length - 1)]
    const current = stages[Math.max(0, wanted ? places.indexOf(wanted) : 0)] as Stage
    const share = Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, place.stages?.share ?? 0.5))
    const ws: Workspace = base
      ? { ...base, stages, current: current.id, arrangement: { ...base.arrangement, share } }
      : { stages, current: current.id, arrangement: { direction: "row", share }, tools: {} }
    screens.push({ id: place.id, def: place.def, props: props.data, stages: ws })
  }
  // 場所に無くても残すスクリーン: 最初から開いているスクリーンの定義の物が場所に 1 枚も無ければ今の物を、ステージを並べるスクリーンが場所に 1 枚も無ければ今の 1 枚を（開いていたブックを後ろに残す）
  const kept: OpenedScreen[] = []
  // ステージを並べるスクリーンは、いちばん最近カレントにした物を残す
  const recent = recentBookScreen(win)
  for (const s of win.screens) {
    if (screens.some(x => x.id === s.id)) continue
    const have = [...kept, ...screens]
    const needed = s.stages
      ? s.id === recent?.id && !have.some(x => x.stages)
      : catalog.screens.get(s.def)?.atStart === true && !have.some(x => x.def === s.def)
    if (needed) kept.push(s)
  }
  const all = [...kept, ...screens]
  const given = address.order.filter((id, i, list) => all.some(s => s.id === id) && list.indexOf(id) === i)
  const order = [...all.filter(s => !given.includes(s.id)).map(s => s.id), ...given]
  // 機能台帳に無いスクリーンアレンジメントなら、今のまま。値が定義の形に合わなければ、定義の初めの値
  const def = catalog.screenArrangements.get(address.arrangement)
  const arrangement = def ? address.arrangement : win.arrangement
  const arrangementValue = def ? arrangementValueOf(def, address.arrangementValue) : win.arrangementValue
  return withinLimits({ screens: all, order, arrangement, arrangementValue, issued, issuedScreens }, catalog)
}

// 場所が今のままで当てはめを省くときの窓 win: 当てはめたときと同じく、どのステージも初めの位置に合わせない（変わらなければ win のまま）
export function keepPlace(win: WindowState): WindowState {
  return mapScreens(win, ws => {
    const stages = ws.stages.map(stopStart)
    return stages.every((s, i) => s === ws.stages[i]) ? ws : { ...ws, stages }
  })
}
