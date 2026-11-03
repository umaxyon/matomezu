// 紙を急ぎ目になめらかにずらす: ずらす量 (dx, dy) を GLIDE_MS かけて、コマごとに少しずつずらす（始めは速く、終わりはゆっくり）。
// 動きを減らす設定（prefers-reduced-motion）なら 1 度にずらす。動いている間にまた呼ぶか、ホイールを回すかポインタを押すと、前の動きはそこで止める
const GLIDE_MS = 180

// コマを待つ口と今の時刻（テストでは差し替える）
export interface GlideClock {
  frame(step: (now: number) => void): void
  now(): number
  still(): boolean // 動きを減らす設定か
}

const browserClock: GlideClock = {
  frame: step => requestAnimationFrame(step),
  now: () => performance.now(),
  still: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
}

let running: (() => void) | null = null // 動いているずらしを止める関数

export function glidePan(pan: (dx: number, dy: number) => void, dx: number, dy: number, clock = browserClock): void {
  running?.()
  if (clock.still()) {
    pan(dx, dy)
    return
  }
  const start = clock.now()
  let done = 0 // ここまでにずらした割合
  let stopped = false
  const stop = () => {
    stopped = true
    running = null
    if (typeof window !== "undefined") {
      window.removeEventListener("wheel", stop, true)
      window.removeEventListener("pointerdown", stop, true)
    }
  }
  running = stop
  if (typeof window !== "undefined") {
    window.addEventListener("wheel", stop, true)
    window.addEventListener("pointerdown", stop, true)
  }
  const step = (now: number) => {
    if (stopped) return
    const t = Math.min(1, (now - start) / GLIDE_MS)
    const eased = t === 1 ? 1 : 1 - (1 - t) ** 3
    pan(dx * (eased - done), dy * (eased - done))
    done = eased
    if (t < 1) clock.frame(step)
    else stop()
  }
  clock.frame(step)
}
