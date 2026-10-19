// ステージのビュー: ステージ（core/stage.ts）を読んで、与えられた枠の中に紙を描く。
// 測った大きさと、ドラッグ・ホイールで動いた量を、そのまま store の操作に渡す（ずらす量の計算はステージの側）
import { memo, type PointerEvent, useRef, useState, type WheelEvent } from "react"
import { placement } from "../../core/stage"
import { useActions, useApp } from "../store-context"
import styles from "./StageView.module.css"
import { useResize } from "./use-resize"

// ドラッグ中のポインタと、前に知らせた位置
interface Drag {
  pointer: number
  x: number
  y: number
}

export const StageView = memo(function StageView({ id }: { id: string }) {
  const stage = useApp(s => s.workspace.stages.find(st => st.id === id))
  const isCurrent = useApp(s => s.workspace.current === id)
  const isMulti = useApp(s => s.workspace.stages.length > 1)
  const { focusStage, resizeStage, panStageBy } = useActions()
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)
  useResize(ref, view => resizeStage(id, view))
  if (!stage) return null

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    focusStage(id)
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY }
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    panStageBy(id, e.clientX - d.x, e.clientY - d.y)
    d.x = e.clientX
    d.y = e.clientY
  }
  const endDrag = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointer !== e.pointerId) return
    drag.current = null
    setDragging(false)
  }
  const onWheel = (e: WheelEvent<HTMLElement>) => {
    const dx = e.shiftKey ? e.deltaY : e.deltaX
    const dy = e.shiftKey ? e.deltaX : e.deltaY
    panStageBy(id, -dx, -dy)
  }

  const p = placement(stage)
  return (
    <section
      ref={ref}
      className={styles.stage}
      aria-label="ステージ"
      data-current={isCurrent}
      data-multi={isMulti}
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      <div
        className={styles.paper}
        role="img"
        aria-label="紙"
        style={{ width: p.w, height: p.h, transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})` }}
      />
    </section>
  )
})
