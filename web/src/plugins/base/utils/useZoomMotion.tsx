// 倍率が変わったときだけ、紙の移り変わりを ZOOM_MS かけてなめらかにする CSS の transition（変わっていない間は無し。ずらすときは付いて来るまま）。
// 紙の transform（translate と scale）を一緒に移すので、倍率を変えても動かない点は途中でも動かない。動きを減らす設定なら付けない
import { useEffect, useRef, useState } from "react"

export const ZOOM_MS = 200

export function useZoomMotion(zoom: number): string | undefined {
  const last = useRef(zoom)
  const [moving, setMoving] = useState(0) // 倍率が変わるたびに増やし、ZOOM_MS 経てば 0 に戻す
  if (last.current !== zoom) {
    last.current = zoom
    setMoving(n => n + 1)
  }
  useEffect(() => {
    if (moving === 0) return
    const timer = setTimeout(() => setMoving(0), ZOOM_MS)
    return () => clearTimeout(timer)
  }, [moving])
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
  return moving > 0 && !reduced ? `transform ${ZOOM_MS}ms cubic-bezier(0.33, 1, 0.68, 1)` : undefined
}
