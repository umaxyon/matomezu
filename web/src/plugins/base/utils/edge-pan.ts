// ドラッグの間、ポインタを表示領域の端の帯へ寄せている間に紙をずらす（ツリーの節・ディレクトリ構成図の行のドラッグなど）。速さは edgeSpeed
import type { Point } from "../../../core/geom"
import { edgeSpeed } from "./edge-speed"

// 大きさ view の表示領域の中の点 p（左上から）で、dt 秒の間に紙をずらす量（速さは edgeSpeed。端に近くなければ 0）。
// 左の端では右へ（左にある物が見えてくる向き）ずらす
export function edgeScroll(p: Point, view: { w: number; h: number }, dt: number): Point {
  return { x: -edgeSpeed(p.x, 0, view.w) * dt, y: -edgeSpeed(p.y, 0, view.h) * dt }
}

// ドラッグの間、紙をずらし続ける繰り返し: follow でポインタの所（画面の座標）を渡すと、表示領域 area（画面の座標の四角）の端の近くにある間、
// コマごとに pan でずらす（ずらす量は前のコマからの時間で決める。ポインタを動かさなくても続き、端を離れたら止まる）。stop でやめる
export function edgePanner(
  area: () => { x: number; y: number; w: number; h: number } | null,
  pan: (dx: number, dy: number) => void,
) {
  let frame = 0
  let prev = 0 // 前にずらした時刻（0 は止まっていた）
  let pointer: Point | null = null
  const tick = (now: number) => {
    frame = 0
    const r = area()
    if (!pointer || !r) return
    // 前のコマからの時間（止まっていたら 1 コマ分。間が空いても一度に飛ばない）
    const dt = Math.min(prev ? now - prev : 16, 50) / 1000
    const by = edgeScroll({ x: pointer.x - r.x, y: pointer.y - r.y }, { w: r.w, h: r.h }, dt)
    if (by.x === 0 && by.y === 0) {
      prev = 0
      return
    }
    prev = now
    pan(by.x, by.y)
    frame = requestAnimationFrame(tick)
  }
  return {
    follow(p: Point) {
      pointer = p
      if (!frame) frame = requestAnimationFrame(tick)
    },
    stop() {
      pointer = null
      prev = 0
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    },
  }
}
