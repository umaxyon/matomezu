// 行をドラッグしている間の、リストの行の並びのスクロール: ポインタの下のリストの、行の並びの見えている範囲の上か下の端の帯へ寄せている間、
// その向きへスクロールし続ける（速さは base の edgeSpeed）。ポインタを動かさなくても続く。スクロールするたびに again を呼ぶ（落とす所を決め直す）
import { edgeSpeed } from "../../base"

// ポインタ（画面の座標）の下のリストの、行の並びのスクロールする要素
function rowsUnder(x: number, y: number): HTMLElement | null {
  const item = document
    .elementsFromPoint(x, y)
    .map(el => el.closest("[data-item]"))
    .find(Boolean)
  return item?.querySelector<HTMLElement>("[data-list-rows]")?.parentElement ?? null
}

export function edgeScroller() {
  let frame = 0
  let last: { x: number; y: number; again: () => void } | null = null
  let prev = 0 // 前にスクロールした時刻（0 は止まっていた）
  let carry = 0 // 1px に満たない分（スクロールの位置は整数に丸められるため、次のコマへ持ち越す）
  const tick = (now: number) => {
    frame = 0
    const el = last && rowsUnder(last.x, last.y)
    if (!last || !el) return
    const r = el.getBoundingClientRect()
    const v = edgeSpeed(last.y, r.top, r.bottom)
    if (v === 0) {
      prev = 0
      carry = 0
      return
    }
    // 前のコマからの時間（止まっていたら 1 コマ分。間が空いても一度に飛ばない）
    const dt = Math.min(prev ? now - prev : 16, 50) / 1000
    prev = now
    const m = carry + v * dt
    const dy = Math.trunc(m)
    carry = m - dy
    if (dy !== 0) {
      const before = el.scrollTop
      el.scrollTop += dy
      if (el.scrollTop === before) return // もう進めない（上か下の端）
      last.again()
    }
    frame = requestAnimationFrame(tick)
  }
  return {
    follow(x: number, y: number, again: () => void) {
      last = { x, y, again }
      if (!frame) frame = requestAnimationFrame(tick)
    },
    stop() {
      last = null
      prev = 0
      carry = 0
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    },
  }
}
