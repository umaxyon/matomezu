// ペインの見出しのドラッグ（フック）: 並べた 2 つのペインの見出しを掴み、もう片方のペインの上で離すと入れ替える（onSwap）。
// DRAG_START だけ動かしてから始め、ドラッグ中は掴んだ見出しの写しをポインタに付け、もう片方のペインの上にあるかを over で返す。そのほかの所で離したら取り消す
import { type PointerEvent, useRef, useState } from "react"
import { DRAG_START } from "../../../base"
import type { Pane } from "../panes"

// ドラッグ中の様子: 掴んだペイン、ポインタの位置（画面の座標）、掴んだ所の見出しの左上からの距離、もう片方のペインの上か
export interface PaneDrag {
  pane: Pane
  x: number
  y: number
  grab: { x: number; y: number }
  over: boolean
}

export function usePaneSwap(onSwap: () => void) {
  const [drag, setDrag] = useState<PaneDrag | null>(null)
  const sections = useRef(new Map<Pane, HTMLElement>())
  const press = useRef<{ pane: Pane; x: number; y: number; grab: { x: number; y: number } } | null>(null)
  const end = (commit: boolean) => {
    const was = drag
    press.current = null
    setDrag(null)
    if (commit && was?.over) onSwap()
  }
  return {
    drag,
    // ペインの要素を覚える（もう片方のペインの上かを測る）
    section: (pane: Pane) => (el: HTMLElement | null) => {
      if (el) sections.current.set(pane, el)
      else sections.current.delete(pane)
    },
    // 見出しを掴む・動かす・離す
    handlers: (pane: Pane) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        const r = e.currentTarget.getBoundingClientRect()
        press.current = { pane, x: e.clientX, y: e.clientY, grab: { x: e.clientX - r.left, y: e.clientY - r.top } }
        e.currentTarget.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const p = press.current
        if (!p || p.pane !== pane) return
        if (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START) return
        const other = [...sections.current].find(([k]) => k !== pane)?.[1]?.getBoundingClientRect()
        const over =
          !!other &&
          e.clientX >= other.left &&
          e.clientX <= other.right &&
          e.clientY >= other.top &&
          e.clientY <= other.bottom
        setDrag({ pane, x: e.clientX, y: e.clientY, grab: p.grab, over })
      },
      onPointerUp: () => {
        if (press.current) end(true)
      },
      onPointerCancel: () => end(false),
    }),
  }
}
