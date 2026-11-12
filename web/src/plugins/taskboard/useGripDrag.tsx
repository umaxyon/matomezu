// 行の左のつまみでドラッグして並べ替える。つまみを押している行だけを draggable にする（行の中の文字の選択や入力をドラッグにしない）。
// 行の枠に dragRowProps、つまみ（Grip）に gripProps を付け、ほかの行の上で離すと onMove(ドラッグした行, 離した行) を呼ぶ
import { type DragEvent, useState } from "react"

export function useGripDrag(onMove: (dragging: string, over: string) => void) {
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const dragRowProps = (id: string) => ({
    draggable: id === grabbed,
    "data-dragging": id === dragging,
    onPointerUp: () => setGrabbed(null),
    onDragStart: () => setDragging(id),
    onDragEnd: () => {
      setGrabbed(null)
      setDragging(null)
    },
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: () => {
      if (dragging && dragging !== id) onMove(dragging, id)
    },
  })
  const gripProps = (id: string) => ({ onPointerDown: () => setGrabbed(id) })

  return { dragRowProps, gripProps }
}
