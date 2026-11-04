// 要素の上でホイールを回したら、回した量をコマンド zoom-wheel に渡す（表示領域の真ん中を動かさずに拡大縮小し、ページはスクロールさせない）
import { useCallback, useRef } from "react"
import { useCommand } from "../../../ui/commands"
import { ZOOM_WHEEL } from "."

// 要素に付ける ref。ページのスクロールを止めるため、受け身でない受け取りで付ける（描かれたときに付くので、後から出る要素にも付く）
export function useZoomWheel(stage: string): (el: HTMLElement | null) => (() => void) | undefined {
  const wheel = useCommand(stage, ZOOM_WHEEL.id)
  const latest = useRef(wheel)
  latest.current = wheel
  return useCallback((el: HTMLElement | null) => {
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!latest.current.shown) return
      e.preventDefault()
      e.stopPropagation()
      latest.current.run({ delta: e.deltaY })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])
}
