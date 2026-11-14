// 列の行が並び替わったとき、縦に動いた行を元の位置から滑らせる（FLIP）。動きを減らす設定では動かさない
import { useLayoutEffect, useRef } from "react"

const SLIDE_MS = 300

export function useRowSlide(order: readonly string[]) {
  const elements = useRef(new Map<string, HTMLElement>())
  const tops = useRef<Map<string, number>>(new Map())

  // biome-ignore lint/correctness/useExhaustiveDependencies: order が変わった描画の直後に、前の位置との差を動かす
  useLayoutEffect(() => {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
    const now = new Map<string, number>()
    for (const [id, el] of elements.current) {
      const top = el.getBoundingClientRect().top
      now.set(id, top)
      const from = tops.current.get(id)
      if (reduced || from === undefined || Math.abs(from - top) <= 1) continue
      el.style.transition = "none"
      el.style.transform = `translateY(${from - top}px)`
      el.getBoundingClientRect() // 元の位置を描かせてから、transition を戻して動かす
      el.style.transition = `transform ${SLIDE_MS}ms ease`
      el.style.transform = ""
    }
    tops.current = now
  }, [order])

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(id, el)
    else elements.current.delete(id)
  }
  return register
}
