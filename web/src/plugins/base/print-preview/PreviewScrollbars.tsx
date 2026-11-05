// 印刷プレビューのスクロールバー: ステージの右端に縦、並べた印刷区画が幅からはみ出しているときだけ下端に横のバーを出し、並べた印刷区画のどこを見ているかをつまみで示す
// （つまみの長さは見えている割合）。つまみをドラッグするとずらし、溝を押すとそこへ移る。ずらす量はステージが持つ（パンと同じ。範囲に収めるのもステージ）
import { type PointerEvent, useRef } from "react"
import type { Point, Size } from "../../../core/geom"
import { contentSize } from "../../../core/viewport"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useStagePan } from "../../../ui/view-hooks"
import styles from "./PreviewScrollbars.module.css"

// 向きごとの、見えている所: 中身の長さ content・表示領域の長さ view・ずらす量 pan（0 から view - content）
interface Axis {
  content: number
  view: number
  pan: number
}

export function PreviewScrollbars({ stage, area }: { stage: string; area: Size }) {
  const pan = useStagePan(stage)
  const zoom = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.zoom ?? 1)
  const view = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.view ?? null)
  if (!pan || !view) return null
  const content = contentSize(area, zoom)
  const x = { content: content.w, view: view.w, pan: pan.x }
  const y = { content: content.h, view: view.h, pan: pan.y }
  // 横のバーは、並べた印刷区画そのものが表示領域の幅からはみ出すときだけ出す（周りの余白の分だけずらせるときは出さない）
  const showsY = y.content > y.view
  const showsX = area.w * zoom > view.w
  // 両方のバーを出すときは、右下の角を空ける
  const both = showsY && showsX
  return (
    <>
      {showsY && <Bar stage={stage} axis={y} along="y" corner={both} />}
      {showsX && <Bar stage={stage} axis={x} along="x" corner={both} />}
    </>
  )
}

function Bar({ stage, axis, along, corner }: { stage: string; axis: Axis; along: "x" | "y"; corner: boolean }) {
  const { panStageBy, focusStage } = useActions()
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; at: number } | null>(null)
  const size = (el: HTMLElement) => (along === "y" ? el.clientHeight : el.clientWidth)
  const at = (e: PointerEvent) => (along === "y" ? e.clientY : e.clientX)
  // つまみの長さと位置（溝の長さに対する割合）
  const length = axis.view / axis.content
  const offset = -axis.pan / axis.content
  // 溝の上で動いた量 d（px）だけ、つまみを動かすずらし
  const panBy = (d: number) => {
    const el = track.current
    if (!el) return
    const by = -(d / size(el)) * axis.content
    panStageBy(stage, along === "x" ? by : 0, along === "y" ? by : 0)
  }
  // 押したらステージをカレントにする（ステージの手のひらのドラッグには渡さない。字の選択を始めないよう、溝で mousedown の既定の動きを止める）
  const onTrack = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    focusStage(stage)
    const el = track.current
    if (e.button !== 0 || !el || e.target !== el) return
    // 押した所がつまみの真ん中になるように移る
    const box = el.getBoundingClientRect()
    const pressed = at(e) - (along === "y" ? box.top : box.left)
    panBy(pressed - (offset + length / 2) * size(el))
  }
  const onThumb = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    focusStage(stage)
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, at: at(e) }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    panBy(at(e) - d.at)
    d.at = at(e)
  }
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer === e.pointerId) drag.current = null
  }
  const place = (p: Point) =>
    along === "y"
      ? { top: `${p.x * 100}%`, height: `${p.y * 100}%` }
      : { left: `${p.x * 100}%`, width: `${p.y * 100}%` }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: スクロールバーはポインタで動かす（キーでずらすのはステージ）
    <div
      ref={track}
      className={styles.track}
      data-along={along}
      data-corner={corner}
      data-preview-scrollbar={along}
      onPointerDown={onTrack}
      onMouseDown={e => e.preventDefault()}
    >
      <div
        className={styles.thumb}
        style={place({ x: offset, y: length })}
        onPointerDown={onThumb}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  )
}
