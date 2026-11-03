// 紙を急ぎ目になめらかにずらす: ずらす量 (dx, dy) を GLIDE_MS かけて、コマごとに少しずつずらす（始めは速く、終わりはゆっくり）。
// 動きを減らす設定（prefers-reduced-motion）なら 1 度にずらす
const GLIDE_MS = 180

export function glidePan(pan: (dx: number, dy: number) => void, dx: number, dy: number): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    pan(dx, dy)
    return
  }
  const start = performance.now()
  let done = 0 // ここまでにずらした割合
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / GLIDE_MS)
    const eased = 1 - (1 - t) ** 3
    pan(dx * (eased - done), dy * (eased - done))
    done = eased
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
