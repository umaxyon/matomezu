// 窓の上に重ねて出す吹き出しの置き場: 吹き出し box を測ってから、描く前に点 at の下（入らなければ above の上）に置き直す（fit.ts の placeBubble）。
// 置き直すまでは at に置く（隠すと中の物に焦点を移せないので、隠さない）
import { type RefObject, useLayoutEffect, useState } from "react"
import type { Point } from "../../../core/geom"
import { type BubbleAt, placeBubble } from "./fit"

export function usePlacedBubble(box: RefObject<HTMLElement | null>, at: BubbleAt): Point {
  const [placed, setPlaced] = useState<Point | null>(null)
  const { x, y, above } = at
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    setPlaced(
      placeBubble({ x, y, above }, { w: r.width, h: r.height }, { w: window.innerWidth, h: window.innerHeight }),
    )
  }, [box, x, y, above])
  return placed ?? { x, y }
}
