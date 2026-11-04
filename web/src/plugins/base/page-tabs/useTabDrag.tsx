// ページタブのドラッグ（フック）: タブを掴んで並べ替える。4px 動かしてから始め、落とす所を index で追い、離したらアクション page-move を行う。
// タブの並びの外で離したら取り消す。並びが横にあふれていれば、端へ寄せている間スクロールする。始める前に page-move を行えるか問い、行えなければ始めない
import { type PointerEvent, type RefObject, useEffect, useRef, useState } from "react"
import { useAllowed, usePerform } from "../../../ui/view-hooks"
import { edgePanner } from "../utils"
import { PAGE_MOVE } from "./page-move"
import { dropIndex, within } from "./tab-drop"

const DRAG_START = 4 // ドラッグを始めるまでに動かす px
const OUTSIDE = 24 // タブの並びの外へ出たと見る px

// ドラッグ中の様子: 掴んだページ、ポインタの位置（画面の座標）、掴んだ所のタブの左からの距離、落とす所の index（掴んだタブを除いて数える。並びの外なら null）
export interface TabDrag {
  id: string
  x: number
  y: number
  grab: number
  index: number | null
}

export function useTabDrag(stage: string, list: RefObject<HTMLElement | null>, ids: readonly string[]) {
  const perform = usePerform(stage)
  const movable = useAllowed(stage, PAGE_MOVE.id).ok
  const [drag, setDrag] = useState<TabDrag | null>(null)
  const slots = useRef(new Map<string, HTMLElement>())
  const press = useRef<{ id: string; x: number; y: number; grab: number } | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false) // 離したあとの click を、ページを開く操作にしない

  // ポインタの所で、落とす所を決める
  const aim = (id: string, grab: number) => {
    const p = pointer.current
    const el = list.current
    if (!p || !el) return
    const others = [...slots.current].filter(([k]) => k !== id).map(([, e]) => e.getBoundingClientRect())
    const index = within(el.getBoundingClientRect(), p, OUTSIDE)
      ? dropIndex(
          others.map(r => r.left + r.width / 2),
          p.x,
        )
      : null
    setDrag({ id, grab, x: p.x, y: p.y, index })
  }
  const aimRef = useRef(aim)
  aimRef.current = aim

  const panner = useRef(
    edgePanner(
      () => {
        const r = list.current?.getBoundingClientRect()
        return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      },
      dx => {
        if (list.current) list.current.scrollLeft -= dx
        const g = press.current
        if (g) aimRef.current(g.id, g.grab)
      },
    ),
  ).current
  useEffect(() => () => panner.stop(), [panner])

  const end = (commit: boolean) => {
    panner.stop()
    const g = press.current
    press.current = null
    pointer.current = null
    const d = drag
    setDrag(null)
    if (commit && g && d?.index != null && d.index !== ids.indexOf(g.id))
      perform(PAGE_MOVE.id, { page: g.id, index: d.index })
  }

  return {
    drag,
    // 掴んだタブの元の場所のしるし（薄くする）と、落とす所の線の位置（並びの中の左端の px。落とす所が無ければ null）
    bar: (() => {
      if (!drag || drag.index === null) return null
      const others = ids.filter(k => k !== drag.id).map(k => slots.current.get(k))
      const at = others[drag.index]
      const last = others.at(-1)
      if (at) return at.offsetLeft - 1
      return last ? last.offsetLeft + last.offsetWidth + 1 : null
    })(),
    // タブの置き場所（slot）の要素を覚える
    slot: (id: string) => (el: HTMLElement | null) => {
      if (el) slots.current.set(id, el)
      else slots.current.delete(id)
    },
    // 掴んだあとの click を、ページを開く操作にしない（開く側が呼んで、true なら開かない）
    swallowClick: () => {
      const was = dragged.current
      dragged.current = false
      return was
    },
    // タブを掴む・動かす・離す
    handlers: (id: string) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || !movable) return
        dragged.current = false
        press.current = {
          id,
          x: e.clientX,
          y: e.clientY,
          grab: e.clientX - e.currentTarget.getBoundingClientRect().left,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const g = press.current
        if (!g || g.id !== id) return
        pointer.current = { x: e.clientX, y: e.clientY }
        if (!drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_START) return
        dragged.current = true
        aim(id, g.grab)
        panner.follow({ x: e.clientX, y: e.clientY })
      },
      onPointerUp: () => {
        if (press.current) end(true)
      },
      onPointerCancel: () => end(false),
    }),
  }
}
