// 並べ替えで縦に動いた要素を、元の位置から滑らせる（FLIP）。動く前の位置は、並べ替えを確定する直前に snapshot で取る
import { useLayoutEffect, useRef } from "react"
import { MOTION_MS, REORDER_CLEAR_MS } from "./motion"

export function useReorderAnimation(order: readonly string[]) {
  const elements = useRef(new Map<string, HTMLElement>())
  const tops = useRef<Map<string, number> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: order が変わった描画の直後に、取っておいた位置との差を動かす
  useLayoutEffect(() => {
    const before = tops.current
    tops.current = null
    if (!before) return
    for (const [id, el] of elements.current) {
      const from = before.get(id)
      if (from === undefined) continue
      const shift = from - el.getBoundingClientRect().top
      if (Math.abs(shift) <= 1) continue
      el.style.transition = "none"
      el.style.transform = `translateY(${shift}px)`
      el.getBoundingClientRect() // 元の位置を描かせてから、transition を戻して動かす
      el.style.transition = `transform ${MOTION_MS}ms ease`
      el.style.transform = ""
      window.setTimeout(() => {
        el.style.transition = ""
      }, REORDER_CLEAR_MS)
    }
  }, [order])

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(id, el)
    else elements.current.delete(id)
  }
  const snapshot = () => {
    tops.current = new Map([...elements.current].map(([id, el]) => [id, el.getBoundingClientRect().top]))
  }
  return { register, snapshot }
}
