// 並びが替わったとき、縦に動いた要素を元の位置から滑らせる（FLIP）。動きを減らす設定では動かさない。
// 元の位置は from で決める: "last" は前の描画の位置、"snapshot" は並べ替えを確定する直前に snapshot で取った位置（取っていなければ動かさない）。
// 要素には register(id) を ref に渡す
import { useLayoutEffect, useRef } from "react"

const SLIDE_MS = 300 // CSS の --motion と同じ
const CLEAR_MS = SLIDE_MS + 20 // 動き終えてから transition の指定を外すまでの待ち

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

const topsOf = (elements: ReadonlyMap<string, HTMLElement>) =>
  new Map([...elements].map(([id, el]) => [id, el.getBoundingClientRect().top]))

export function useRowSlide(order: readonly string[], { from = "last" }: { from?: "last" | "snapshot" } = {}) {
  const elements = useRef(new Map<string, HTMLElement>())
  const tops = useRef<Map<string, number> | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: order が変わった描画の直後に、元の位置との差を動かす
  useLayoutEffect(() => {
    const before = tops.current
    const now = topsOf(elements.current)
    tops.current = from === "last" ? now : null
    if (!before || reduced()) return
    for (const [id, el] of elements.current) {
      const was = before.get(id)
      const top = now.get(id)
      if (was === undefined || top === undefined || Math.abs(was - top) <= 1) continue
      el.style.transition = "none"
      el.style.transform = `translateY(${was - top}px)`
      el.getBoundingClientRect() // 元の位置を描かせてから、transition を戻して動かす
      el.style.transition = `transform ${SLIDE_MS}ms ease`
      el.style.transform = ""
      window.setTimeout(() => {
        el.style.transition = ""
      }, CLEAR_MS)
    }
  }, [order])

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(id, el)
    else elements.current.delete(id)
  }
  const snapshot = () => {
    tops.current = topsOf(elements.current)
  }
  return { register, snapshot }
}
