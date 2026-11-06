// 要素の中の大きさ（枠線を除く）を測って知らせ、変わるたびに知らせ直す（測れるようになったらすぐに 1 度知らせる）。
// 隠れて測れない間（刷るときに画面を隠したときなど、幅も高さも 0）は知らせない（0 を覚えて、見え方がずれないように）
import { type RefObject, useEffectEvent, useLayoutEffect } from "react"
import type { Size } from "../../../core/geom"

export function useResize(ref: RefObject<HTMLElement | null>, onResize: (size: Size) => void): void {
  const report = useEffectEvent(onResize)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      if (el.clientWidth === 0 && el.clientHeight === 0) return
      report({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
}
