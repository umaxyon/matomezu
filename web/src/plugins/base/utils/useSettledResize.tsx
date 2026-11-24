// 要素の中の大きさを、変わり始めと、変わりが止まったときに知らせる（useResize と同じに測る）。変わり始めはすぐ知らせ、そのあと毎コマ測り、
// 1 コマ同じ大きさが続いたら（知らせた大きさと違えば）知らせて、また変わり始めを待つ。スクリーンが伸び縮みして滑る間に、毎コマ知らせて描き直さないため
import { type RefObject, useEffect, useEffectEvent, useRef } from "react"
import type { Size } from "../../../core/geom"
import { useResize } from "./useResize"

const same = (a: Size, b: Size) => a.w === b.w && a.h === b.h

export function useSettledResize(ref: RefObject<HTMLElement | null>, onResize: (size: Size) => void): void {
  const report = useEffectEvent(onResize)
  // 変わっている間だけ持つ: 知らせた大きさ・前のコマに測った大きさ・次に測るコマ
  const watch = useRef<{ sent: Size; seen: Size; frame: number } | null>(null)
  useEffect(
    () => () => {
      if (watch.current) cancelAnimationFrame(watch.current.frame)
      watch.current = null
    },
    [],
  )
  useResize(ref, size => {
    if (watch.current) return
    report(size)
    const check = () => {
      const now = watch.current
      const el = ref.current
      if (!now || !el) return
      const next = { w: el.clientWidth, h: el.clientHeight }
      if (same(next, now.seen)) {
        watch.current = null
        if (!same(next, now.sent) && (next.w > 0 || next.h > 0)) report(next)
        return
      }
      watch.current = { ...now, seen: next, frame: requestAnimationFrame(check) }
    }
    watch.current = { sent: size, seen: size, frame: requestAnimationFrame(check) }
  })
}
