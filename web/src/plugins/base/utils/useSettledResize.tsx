// 要素の中の大きさを、変わりが止まってから知らせる（useResize と同じに測る。最初の 1 回はすぐ知らせ、そのあとの変わりは、1 コマ同じ大きさが続いてから知らせる）。
// スクリーンが伸び縮みして滑る間に、毎コマ知らせて描き直さないため
import { type RefObject, useEffect, useEffectEvent, useRef } from "react"
import type { Size } from "../../../core/geom"
import { useResize } from "./useResize"

export function useSettledResize(ref: RefObject<HTMLElement | null>, onResize: (size: Size) => void): void {
  const report = useEffectEvent(onResize)
  const reported = useRef(false)
  const wait = useRef<{ size: Size; frame: number } | null>(null)
  useEffect(
    () => () => {
      if (wait.current) cancelAnimationFrame(wait.current.frame)
    },
    [],
  )
  useResize(ref, size => {
    if (!reported.current) {
      reported.current = true
      report(size)
      return
    }
    if (wait.current) cancelAnimationFrame(wait.current.frame)
    const check = () => {
      const el = ref.current
      const now = wait.current?.size
      if (!el || !now) return
      const next = { w: el.clientWidth, h: el.clientHeight }
      if (next.w === now.w && next.h === now.h) {
        wait.current = null
        report(now)
        return
      }
      wait.current = { size: next, frame: requestAnimationFrame(check) }
    }
    wait.current = { size, frame: requestAnimationFrame(check) }
  })
}
