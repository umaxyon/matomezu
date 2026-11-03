// ホイールを受ける物: ステージの上でポインタの下にある、スクロールする物（リストの行の並び・データの表など）と、紙をずらすステージのどちらが受けるか。
// 一続きの回し（前の回しから WHEEL_GAP ミリ秒より前に来た回し）は、始めに決めた物が終わりまで受ける。始めに、回した向きへまだスクロールできる物が
// ポインタの下にあればその物（中のスクロールはブラウザが動かす）、無ければステージ。スクロールする物が端に着いたら、手を止めて次に回したときからステージが受ける
// （トラックパッドの惰性で紙まで流れない）。ステージが受ける回しは、中の物をスクロールさせない

// ホイールを受ける物（inner: ポインタの下のスクロールする物、stage: 紙をずらすステージ）
export type WheelTaker = "inner" | "stage"

// 一続きの回しと見なす、前の回しからの間（ミリ秒）
export const WHEEL_GAP = 300

// 一続きの回しで決めた受ける物と、最後に回した時刻
export interface WheelLatch {
  readonly taker: WheelTaker
  readonly at: number
}

// スクロールする物の、ある向きの今の位置（scroll）・中身の長さ（content）・見える長さ（seen）
export interface ScrollSpan {
  readonly scroll: number
  readonly content: number
  readonly seen: number
}

// span が量 by の向きへまだスクロールできるか（by が 0 ならできない）
export function scrollsToward(span: ScrollSpan, by: number): boolean {
  if (by < 0) return span.scroll > 0
  if (by > 0) return Math.ceil(span.scroll) < span.content - span.seen
  return false
}

// 時刻 at の回しを受ける物。latch は前の回しの記録、inner はポインタの下に回した向きへまだスクロールできる物があるか
export function wheelTaker(latch: WheelLatch | null, at: number, inner: boolean): WheelTaker {
  if (latch && at - latch.at < WHEEL_GAP) return latch.taker
  return inner ? "inner" : "stage"
}

// 要素 from から outer の手前までの祖先に、量 (dx, dy) の向きへまだスクロールできる物があるか（スクロールする物は、overflow が auto か scroll のもの）
export function scrollsInside(from: EventTarget | null, outer: Element, dx: number, dy: number): boolean {
  for (let el = from instanceof Element ? from : null; el && el !== outer; el = el.parentElement) {
    const style = getComputedStyle(el)
    const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll"
    if (scrolls(style.overflowY) && scrollsToward(span(el.scrollTop, el.scrollHeight, el.clientHeight), dy)) return true
    if (scrolls(style.overflowX) && scrollsToward(span(el.scrollLeft, el.scrollWidth, el.clientWidth), dx)) return true
  }
  return false
}
const span = (scroll: number, content: number, seen: number): ScrollSpan => ({ scroll, content, seen })
