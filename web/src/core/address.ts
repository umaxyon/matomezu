// 画面の場所: 見ているもの（窓の状態 window.ts）のうち、読み直しても戻したいもの。開いているスクリーンの並び（1 枚ごとの id・定義の id・渡された値）とカレントにした順、
// ステージを並べるスクリーンの、ステージごとに開いているブックとページ・倍率・ずらす量（印刷プレビューの間は、閉じたときに戻す編集の倍率とずらす量。
// 印刷プレビューの間かは入れず、読み直すと編集に戻る）・カレントのステージ・分けている境目の割合と、場所に入れるプラグイン状態（窓・スクリーン・ステージの範囲。
// 中身は読まずに運ぶ。どれを入れるか・形を確かめるのは store）。
// 選択・置こうとしているアイテム・道具は入れない（その場の操作の途中の状態のため）。
// ホストがこれを外（ブラウザの URL など）に写し、外から戻すときに当てはめる。操作はデータを書き換えず、新しい値を返す

import type { CoreCatalog } from "./core-catalog"
import type { Point } from "./geom"
import { sameData } from "./same"
import type { Book } from "./schema/book"
import { newStage, openBook, openFolder, openPage, panBy, type Stage, shownPageId, stopStart } from "./stage"
import { zoomInRange } from "./viewport"
import { mapScreens, NO_SCREEN_DEF, type OpenedScreen, type WindowState } from "./window"
import { MAX_STAGES, MIN_SHARE, newWorkspace, type Workspace } from "./workspace"

export interface StagePlace {
  book: string | null // 開いているブックの id（何も開いていなければ null）
  page: string | null // 開いているページの id
  folder: string | null // 空のフォルダを開いているときの、フォルダの id（ページを開いていれば null）
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
    window: windowValues,
  }
}

function stagesPlaceOf(ws: Workspace, states: (stage: string) => Readonly<Record<string, unknown>>): StagesPlace {
  return {
    places: ws.stages.map(s => {
      const view = s.mode.kind === "print-preview" ? s.mode.back : s
      return {
        book: s.opened?.book ?? null,
        page: shownPageId(s.opened),
        folder: s.opened?.kind === "folder" ? s.opened.folder : null,
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

// 移動したか: 開いているスクリーン（id・定義・渡された値）か、カレントスクリーンか、スクリーンアレンジメントか、どれかのスクリーンのステージの数か、どれかのステージのブック・ページが違う、
// または積むと宣言したプラグイン状態（pushes: 宣言の id）の値が違う
// （倍率・ずらす量・カレント・境目と、積むと宣言していないプラグイン状態だけの違いは移動ではない）
export function moved(a: Address, b: Address, pushes: ReadonlySet<string> = new Set()): boolean {
  if (currentIn(a) !== currentIn(b) || a.screens.length !== b.screens.length || a.arrangement !== b.arrangement)
    return true
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
          p.book !== y[j]?.book ||
          p.page !== y[j]?.page ||
          [...pushes].some(id => !sameData(p.states[id], y[j]?.states[id])),
      )
    )
  })
}

// ステージ stage に、場所 place を当てはめる（無いブック・ページは開かず、開けたものに倍率とずらす量を戻す）
function placed(catalog: CoreCatalog, books: Readonly<Record<string, Book>>, stage: Stage, place: StagePlace): Stage {
  const book = place.book === null ? undefined : books[place.book]
  // 表示領域の大きさ（URL には書かない）はステージのまま
  const fresh = { ...newStage(stage.id), view: stage.view }
  if (!book) return fresh
  let next = openBook(catalog, fresh, book)
  if (place.page !== null) next = openPage(catalog, next, book, place.page)
  else if (place.folder !== null) next = openFolder(catalog, next, book, place.folder)
  // ずらす量は、ほかの操作と同じく範囲に収める（表示領域を測るまでは収めない）。初めの位置には合わせない（場所のずらす量が 0 のときも）
  const zoomed = { ...stopStart(next), zoom: zoomInRange(place.zoom) }
  return panBy(zoomed, place.pan.x - zoomed.pan.x, place.pan.y - zoomed.pan.y)
}

// 窓 win に場所 address を当てはめる。場所のスクリーンを、その id のまま開く（同じ id・同じ定義のスクリーンが開いていれば、その中を使い回す。
// 機能台帳に無い定義・形に合わない渡す値・c と番号でない id のスクリーンは開かない）。場所に無いスクリーンは閉じる（最初から開いているスクリーンと、
// ステージを並べるスクリーンが 1 枚も残らなくなるなら、今の物を残す）。カレントにした順は場所のとおり。
// ステージを並べるスクリーンのステージは、左から同じ番号のものを使い回し、足りなければ足す（MAX_STAGES まで）。開けないブック・ページのステージは何も開かない。
// 場所にステージが無ければ、そのスクリーンのステージは今のまま。場所にスクリーンが無ければ、窓は今のまま。プラグイン状態は当てはめない（store の locate が当てはめる）
export function placeAt(
  catalog: CoreCatalog,
  books: Readonly<Record<string, Book>>,
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
    const places = (place.stages?.places ?? []).slice(0, MAX_STAGES)
    if (places.length === 0) {
      const kept = was?.stages ?? newWorkspace(catalog, null, `s${++issued}`)
      screens.push({ id: place.id, def: place.def, props: props.data, stages: kept })
      continue
    }
    const base = was?.stages
    const stages = places.map((p, i) => placed(catalog, books, base?.stages[i] ?? newStage(`s${++issued}`), p))
    const current = stages[Math.min(Math.max(0, place.stages?.current ?? 0), stages.length - 1)] as Stage
    const share = Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, place.stages?.share ?? 0.5))
    const ws: Workspace = base
      ? { ...base, stages, current: current.id, arrangement: { ...base.arrangement, share } }
      : { stages, current: current.id, arrangement: { direction: "row", share }, tools: {} }
    screens.push({ id: place.id, def: place.def, props: props.data, stages: ws })
  }
  // 場所に無くても残すスクリーン: 最初から開いているスクリーンの定義の物が 1 枚も無い・ステージを並べるスクリーンが 1 枚も無いなら、今の物
  const kept: OpenedScreen[] = []
  for (const s of win.screens) {
    if (screens.some(x => x.id === s.id)) continue
    const have = [...kept, ...screens]
    const needed = s.stages
      ? !have.some(x => x.stages)
      : catalog.screens.get(s.def)?.atStart === true && !have.some(x => x.def === s.def)
    if (needed) kept.push(s)
  }
  const all = [...kept, ...screens]
  if (!all.some(s => s.stages)) return win
  const given = address.order.filter((id, i, list) => all.some(s => s.id === id) && list.indexOf(id) === i)
  const order = [...all.filter(s => !given.includes(s.id)).map(s => s.id), ...given]
  // 機能台帳に無いスクリーンアレンジメントなら、今のまま
  const arrangement = catalog.screenArrangements.has(address.arrangement) ? address.arrangement : win.arrangement
  return { screens: all, order, arrangement, issued, issuedScreens }
}

// 場所が今のままで当てはめを省くときの窓 win: 当てはめたときと同じく、どのステージも初めの位置に合わせない（変わらなければ win のまま）
export function keepPlace(win: WindowState): WindowState {
  return mapScreens(win, ws => {
    const stages = ws.stages.map(stopStart)
    return stages.every((s, i) => s === ws.stages[i]) ? ws : { ...ws, stages }
  })
}
