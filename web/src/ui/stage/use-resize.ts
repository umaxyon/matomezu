// 要素の中の大きさ（枠線を除く）を測って知らせ、変わるたびに知らせ直す
import { type RefObject, useEffectEvent, useLayoutEffect } from "react"
import type { Size } from "../../core/geom"

export function useResize(ref: RefObject<HTMLElement | null>, onResize: (size: Size) => void): void {
  const report = useEffectEvent(onResize)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => report({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
}
