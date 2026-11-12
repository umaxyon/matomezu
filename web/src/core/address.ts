// 画面の場所: 見ているもの（窓の状態 window.ts）のうち、読み直しても戻したいもの。前に出している物（コントロールセンターかブックスクリーン）と、前に出せるブックスクリーンの、ステージごとに開いているブックとページ・倍率・ずらす量（印刷プレビューの間は、
// 閉じたときに戻す編集の倍率とずらす量。印刷プレビューの間かは入れず、読み直すと編集に戻る）、
// カレントのステージ、分けている境目の割合と、ステージごとの、場所に入れるプラグイン状態（中身は読まずに運ぶ。どれを入れるか・形を確かめるのは store）。
// 選択・置こうとしているアイテム・道具は入れない（その場の操作の途中の状態のため）。
// ホストがこれを外（ブラウザの URL など）に写し、外から戻すときに当てはめる。操作はデータを書き換えず、新しい値を返す

import { hasPages } from "./book"
import type { CoreCatalog } from "./core-catalog"
import type { Point } from "./geom"
import { sameData } from "./same"
import type { Book } from "./schema/book"
import { newStage, openBook, openPage, panBy, type Stage, stopStart } from "./stage"
import { zoomInRange } from "./viewport"
import { type Front, mapScreen, screenOf, type WindowState } from "./window"
import { MAX_STAGES, MIN_SHARE } from "./workspace"

export interface StagePlace {
  book: string | null // 開いているブックの id（何も開いていなければ null）
  page: string | null // 開いているページの id
  zoom: number
  pan: Point
  states: Readonly<Record<string, unknown>> // 画面の場所に入れるプラグイン状態（宣言の id → 値。store/plugin-state.ts）
}

export interface Address {
  front: Front // 窓が前に出している物
  stages: readonly StagePlace[] // 左から順（前に出せるブックスクリーンの。空なら、ブックスクリーンは今のまま）
  current: number // カレントのステージの、左からの番号
  share: number // 分けている境目の割合（左のステージの幅）
  window: Readonly<Record<string, unknown>> // ステージに結ばない（ステージに結ばない）、場所に入れるプラグイン状態（宣言の id → 値。store/plugin-state.ts）
}

// 見ているものの場所。states は、ステージの id ごとの画面の場所に入れるプラグイン状態
export function addressOf(
  win: WindowState,
  states: (stage: string) => Readonly<Record<string, unknown>> = () => ({}),
  windowValues: Readonly<Record<string, unknown>> = {},
): Address {
  const ws = screenOf(win)
  return {
    front: win.front,
    stages: ws.stages.map(s => {
      const view = s.mode.kind === "print-preview" ? s.mode.back : s
      return {
        book: s.opened?.book ?? null,
        page: s.opened?.page ?? null,
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
    window: windowValues,
  }
}

// 移動したか: 前に出している物か、ステージの数か、どれかのステージのブック・ページが違う、または積むと宣言した画面の状態（pushes: 宣言の id の組）の値が違う
// （倍率・ずらす量・カレント・境目と、積むと宣言していない画面の状態だけの違いは移動ではない）
export function moved(a: Address, b: Address, pushes: ReadonlySet<string> = new Set()): boolean {
  return (
    a.front !== b.front ||
    a.stages.length !== b.stages.length ||
    a.stages.some((s, i) => s.book !== b.stages[i]?.book || s.page !== b.stages[i]?.page) ||
    [...pushes].some(
      id =>
        !sameData(a.window[id], b.window[id]) ||
        a.stages.some((s, i) => !sameData(s.states[id], b.stages[i]?.states[id])),
    )
  )
}

// ステージ stage に、場所 place を当てはめる（無いブック・ページは開かず、開けたものに倍率とずらす量を戻す）
function placed(catalog: CoreCatalog, books: Readonly<Record<string, Book>>, stage: Stage, place: StagePlace): Stage {
  const book = place.book === null ? undefined : books[place.book]
  // 表示領域の大きさ（URL には書かない）はステージのまま
  const fresh = { ...newStage(stage.id), view: stage.view }
  if (!book) return fresh
  let next = openBook(catalog, fresh, book)
  if (place.page !== null && hasPages(book)) next = openPage(catalog, next, book, place.page)
  // ずらす量は、ほかの操作と同じく範囲に収める（表示領域を測るまでは収めない）。初めの位置には合わせない（場所のずらす量が 0 のときも）
  const zoomed = { ...stopStart(next), zoom: zoomInRange(place.zoom) }
  return panBy(zoomed, place.pan.x - zoomed.pan.x, place.pan.y - zoomed.pan.y)
}

// 窓 win に場所 address を当てはめる。前に出す物を替え、前に出せるブックスクリーンのステージは左から同じ番号のものを使い回し、足りなければ窓が番号を振って足す
// （MAX_STAGES まで）。開けないブック・ページのステージは何も開かない。場所にステージが無ければ、ブックスクリーンは今のまま。画面の状態は当てはめない（store が置く）
export function placeAt(
  catalog: CoreCatalog,
  books: Readonly<Record<string, Book>>,
  win: WindowState,
  address: Address,
): WindowState {
  const front = { ...win, front: address.front }
  const places = address.stages.slice(0, MAX_STAGES)
  if (places.length === 0) return front.front === win.front ? win : front
  let issued = front.issued
  const ws = screenOf(front)
  const stages = places.map((place, i) => {
    const stage = ws.stages[i] ?? newStage(`s${++issued}`)
    return placed(catalog, books, stage, place)
  })
  const current = stages[Math.min(Math.max(0, address.current), stages.length - 1)] as Stage
  const share = Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, address.share))
  const next = { ...ws, stages, current: current.id, arrangement: { ...ws.arrangement, share } }
  return { ...mapScreen(front, () => next), issued }
}

// 場所が今のままで当てはめを省くときの窓 win: 当てはめたときと同じく、どのステージも初めの位置に合わせない（変わらなければ win のまま）
export function keepPlace(win: WindowState): WindowState {
  const ws = screenOf(win)
  const stages = ws.stages.map(stopStart)
  return stages.every((s, i) => s === ws.stages[i]) ? win : mapScreen(win, () => ({ ...ws, stages }))
}
