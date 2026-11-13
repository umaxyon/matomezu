// ドラッグで並べ替えた後の並び: dragging を over の位置へ移す（下へ動かすときは over の後ろ、上へ動かすときは前）
export function moved<T>(list: readonly T[], dragging: T, over: T): T[] {
  if (dragging === over) return [...list]
  const next = list.filter(x => x !== dragging)
  next.splice(next.indexOf(over) + (list.indexOf(dragging) < list.indexOf(over) ? 1 : 0), 0, dragging)
  return next
}
