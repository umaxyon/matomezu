// 項目の文字の領域のつまみ: 選んでいる間（紙をずらす道具の間は除く）、描く所と項目の文字の領域の境に出す。
// 縦の棒なら上下に、横の棒なら左右にドラッグして領域の大きさを変え、ドラッグの間は onDrag でその大きさを渡して描き直させる。
// 離したらアクション item-update で labelSize を書く。書き換えが止められていれば出さない
import { type PointerEvent, useRef } from "react"
import { type Size, toPaperDelta } from "../../../plugin-api"
import { useAllowed, useMessages, usePerform, useStage } from "../../../plugin-api/ui"
import styles from "./ChartView.module.css"
import { type CartesianLayout, CHART_LOOK, labelAreaOf, labelSizeAfter } from "./cartesian"
import { kit } from "./kit"

export function LabelGrip({
  c,
  size,
  stage,
  id,
  onDrag,
}: {
  c: CartesianLayout
  size: Size
  stage: string
  id: string
  onDrag: (labelSize: number | undefined) => void // ドラッグの間の大きさ（離せば undefined）
}) {
  const t = useMessages(kit)
  const at = useStage(stage)
  const page = at?.opened?.page ?? undefined
  const perform = usePerform(stage)
  const allowed = useAllowed(stage, "@matomezu/paper:item-update", { page, items: [id] }).ok
  // つかんだポインタと、つかんだ所と、つかんだときの領域の大きさ
  const grab = useRef<{ pointer: number; x: number; y: number; start: number } | null>(null)
  if (!allowed || at === null || at.pans || !at.selection.includes(id)) return null
  // つかんだときの大きさを、つかんだ所から動かした量だけ広げた大きさ（縦の棒なら上へ、横の棒なら右へ動かすと広がる）
  const sizeAt = (e: PointerEvent, g: { x: number; y: number; start: number }) => {
    const d = toPaperDelta(at, { x: e.clientX - g.x, y: e.clientY - g.y })
    return labelSizeAfter(g.start, c.horizontal, size, c.horizontal ? d.x : -d.y)
  }
  const { labelArea: a, horizontal } = c
  const gap = CHART_LOOK.tickGap
  const style = horizontal
    ? { left: a.x + a.w + gap / 2 - 3, top: a.y, width: 6, height: a.h }
    : { left: a.x, top: a.y - gap / 2 - 3, width: a.w, height: 6 }
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      grab.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, start: labelAreaOf(c) }
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const g = grab.current
      if (g?.pointer === e.pointerId) onDrag(sizeAt(e, g))
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const g = grab.current
      if (g?.pointer !== e.pointerId) return
      grab.current = null
      onDrag(undefined)
      const next = sizeAt(e, g)
      if (page && next !== g.start)
        perform("@matomezu/paper:item-update", { page, item: id, props: { labelSize: next } })
    },
    onPointerCancel: () => {
      grab.current = null
      onDrag(undefined)
    },
    onDoubleClick: (e: { stopPropagation(): void }) => e.stopPropagation(),
  }
  return (
    <div
      className={styles.grip}
      style={style}
      data-label-grip={horizontal ? "x" : "y"}
      title={t("Label area")}
      {...handlers}
    />
  )
}
