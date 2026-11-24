// 要素の中の大きさを useResize と同じに知らせる。ただし held の間は知らせずに待ち、held が終わったら今の大きさを 1 度知らせる
// （まだ 1 度も知らせていなければ、held の間でもすぐ知らせる）。スクリーンが伸び縮みして滑る間に、毎コマ知らせて描き直さないため
import { type RefObject, useEffect, useEffectEvent, useRef } from "react"
import type { Size } from "../../../core/geom"
import { useResize } from "../utils/useResize"

export function useHeldResize(ref: RefObject<HTMLElement | null>, onResize: (size: Size) => void, held: boolean): void {
  const holding = useRef(held)
  holding.current = held
  const sent = useRef<Size | null>(null)
  const send = useEffectEvent((size: Size) => {
    sent.current = size
    onResize(size)
  })
  useResize(ref, size => {
    if (!holding.current || sent.current === null) send(size)
  })
  useEffect(() => {
    const el = ref.current
    if (held || !el || (el.clientWidth === 0 && el.clientHeight === 0)) return
    const now = { w: el.clientWidth, h: el.clientHeight }
    if (sent.current?.w !== now.w || sent.current?.h !== now.h) send(now)
  }, [held, ref])
}
