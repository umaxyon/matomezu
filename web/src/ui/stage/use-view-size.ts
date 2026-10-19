// 要素の中の大きさ（枠線を除く）を測り、変わったら測り直す
import { type RefObject, useLayoutEffect, useState } from "react"
import type { Size } from "../../core/geom"

export function useViewSize(ref: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () =>
      setSize(prev => {
        const w = el.clientWidth,
          h = el.clientHeight
        return prev && prev.w === w && prev.h === h ? prev : { w, h }
      })
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}
