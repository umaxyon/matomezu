// 並べた 2 つの境目をつかむ所: ポインタで掴んで動かすと、並べた枠 frame の始め（左右に並べたなら左、上下なら上）からポインタまでの長さと、枠の長さを onMove に渡す。
// ダブルクリックで onReset（真ん中に戻すなど）。割合の計算と収め方は使う側（データの側）が持つ
import type { HTMLAttributes, PointerEvent, RefObject } from "react"
import styles from "./SplitHandle.module.css"

export function SplitHandle({
  direction,
  frame,
  onMove,
  onReset,
  className,
  ...rest
}: {
  direction: "row" | "column" // 並べた向き（左右なら row）
  frame: RefObject<HTMLElement | null> // 長さを測る、並べた枠
  onMove: (at: number, length: number) => void
  onReset: () => void
} & Omit<HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onDoubleClick">) {
  const drag = (e: PointerEvent<HTMLElement>) => {
    if (e.type === "pointerdown") {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    if (direction === "row") onMove(e.clientX - box.left, box.width)
    else onMove(e.clientY - box.top, box.height)
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 境目はポインタで動かす（キーの操作は持たない）
    <div
      {...rest}
      className={`${styles.handle} ${className ?? ""}`}
      data-direction={direction}
      onPointerDown={drag}
      onPointerMove={drag}
      onDoubleClick={onReset}
    />
  )
}
