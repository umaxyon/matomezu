// つまみ（か、つまむ所）でドラッグして並べ替える。つまんでいる行だけを draggable にする（行の中の文字の選択や入力をドラッグにしない）。
// 行の枠に dragRowProps と markClass、つまむ所（Grip など）に gripProps を付け、ほかの行の上で離すと onMove(ドラッグした行, 離した行) を呼ぶ。
// ドラッグ中は、離したときに入るすき間（order は今の並び）の側の辺に、行が data-drop（before・after）を持ち、markClass の線が出る。axis は並びの向き（y は縦に並ぶ行、x は横に並ぶ列）
import { type DragEvent, useState } from "react"
import marks from "./DropMark.module.css"

export function useGripDrag(
  onMove: (dragging: string, over: string) => void,
  order: readonly string[],
  axis: "y" | "x" = "y",
) {
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  // 行の中の物（入れ子の別の並べ替えなど）のドラッグの知らせは、この行のドラッグとして扱わない
  const own = (e: DragEvent) => e.target === e.currentTarget
  const dropAt = (id: string) =>
    dragging === null || over !== id || dragging === id
      ? undefined
      : order.indexOf(dragging) < order.indexOf(id)
        ? "after"
        : "before"

  const dragRowProps = (id: string) => ({
    draggable: id === grabbed,
    "data-dragging": id === dragging,
    "data-drop": dropAt(id),
    onPointerUp: () => setGrabbed(null),
    onDragStart: (e: DragEvent) => {
      if (own(e)) setDragging(id)
    },
    onDragEnd: (e: DragEvent) => {
      if (!own(e)) return
      setGrabbed(null)
      setDragging(null)
      setOver(null)
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      if (dragging !== null) setOver(id)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(now => (now === id ? null : now))
    },
    onDrop: () => {
      setOver(null)
      if (dragging && dragging !== id) onMove(dragging, id)
    },
  })
  const gripProps = (id: string) => ({ onPointerDown: () => setGrabbed(id) })

  return { dragRowProps, gripProps, markClass: (axis === "x" ? marks.x : marks.y) ?? "" }
}
