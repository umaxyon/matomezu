// 書庫の画面の行のボタンが、ビューで直に受けるキー Enter（開く）と、右の枠の中身の列の数を測るフック（上下の矢印のコマンドが読む）
import { type KeyboardEvent, useLayoutEffect, useState } from "react"
import { useReadPluginState, useSetPluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { LIBRARY_COLUMNS } from "./state"

// 行のボタンの上の Enter は、押す（選ぶ）代わりに開く（2 回押すのと同じ）
export function openOnEnter(e: KeyboardEvent, open: () => void): void {
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return
  e.preventDefault()
  open()
}

// 右の枠の中身の要素に付ける ref。その要素の大きさか、行の数 count が変わるたびに、最初の段に並ぶ行の数を測って LIBRARY_COLUMNS に置く（同じ数なら置き直さない）
export function useColumnsMeasure(count: number): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const read = useReadPluginState(kit, LIBRARY_COLUMNS)
  const set = useSetPluginState(kit, LIBRARY_COLUMNS)
  // biome-ignore lint/correctness/useExhaustiveDependencies: count は測り直す合図
  useLayoutEffect(() => {
    if (!el) return
    const measure = () => {
      const items = [...el.children] as HTMLElement[]
      const top = items[0]?.offsetTop
      const n = Math.max(1, items.filter(i => i.offsetTop === top).length)
      if (read() !== n) set(n)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [el, count, read, set])
  return setEl
}
