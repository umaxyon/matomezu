// 印刷プレビューのスクロールバー: 並べた印刷区画が表示領域からはみ出している向きだけ、ステージの右端に縦・下端に横のバーを出し、並べた印刷区画のどこを見ているかをつまみで示す
// （つまみの長さは見えている割合。決まりは scrollbar.ts）。つまみをドラッグするとずらし、溝を押すとそこへ移る。広さはステージが印刷プレビューに
// 知らせた広さ（extentOf）で、ずらす量を範囲に収めるのもステージ（パンと同じ）
import { type PointerEvent, useRef } from "react"
import { extentOf } from "../../../core/stage"
import { contentSize } from "../../../core/viewport"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import styles from "./PreviewScrollbars.module.css"
import { panForDrag, panForTrack, type ScrollAxis, shownBars, thumbOf } from "./scrollbar"

type Along = "x" | "y"

const BAR = 10 // バーの太さ（px。PreviewScrollbars.module.css と同じ）。両方のバーを出すときは、溝をこの分だけ短くして右下の角を空ける

export function PreviewScrollbars({ stage }: { stage: string }) {
  const st = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage) ?? null)
  const area = st ? extentOf(st) : null
  if (!st || !area || !st.view) return null
  const content = contentSize(area, st.zoom)
  const shown = shownBars(area, st.zoom, st.view)
  const axes: Record<Along, ScrollAxis> = {
    x: { content: content.w, view: st.view.w, pan: st.pan.x },
    y: { content: content.h, view: st.view.h, pan: st.pan.y },
  }
  // 両方のバーを出すときは、右下の角を空ける
  const corner = shown.x && shown.y
  return (
    <>
      {shown.y && <Bar stage={stage} axis={axes.y} along="y" corner={corner} />}
      {shown.x && <Bar stage={stage} axis={axes.x} along="x" corner={corner} />}
    </>
  )
}

function Bar({ stage, axis, along, corner }: { stage: string; axis: ScrollAxis; along: Along; corner: boolean }) {
  const { panStageBy, focusStage } = useActions()
  const read = useReadState()
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; at: number; start: number } | null>(null)
  const length = axis.view - (corner ? BAR : 0) // 溝の長さ
  const at = (e: PointerEvent) => (along === "y" ? e.clientY : e.clientX)
  // ずらす量を target にする（今のずらす量との差をステージに渡す）
  const panTo = (target: number) => {
    const now = read().workspace.stages.find(s => s.id === stage)?.pan
    if (!now) return
    const by = target - now[along]
    panStageBy(stage, along === "x" ? by : 0, along === "y" ? by : 0)
  }
  // 押したらステージをカレントにする（ステージの手のひらのドラッグには渡さない。字の選択を始めないよう、溝で mousedown の既定の動きを止める）
  const onTrack = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    focusStage(stage)
    const el = track.current
    if (e.button !== 0 || !el || e.target !== el) return
    const box = el.getBoundingClientRect()
    panTo(panForTrack(axis, length, at(e) - (along === "y" ? box.top : box.left)))
  }
  const onThumb = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    focusStage(stage)
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, at: at(e), start: axis.pan }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    panTo(panForDrag(axis, length, d.start, at(e) - d.at))
  }
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer === e.pointerId) drag.current = null
  }
  const thumb = thumbOf(axis, length)
  const place =
    along === "y"
      ? { top: `${thumb.offset * 100}%`, height: `${thumb.length * 100}%` }
      : { left: `${thumb.offset * 100}%`, width: `${thumb.length * 100}%` }
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
        style={place}
        onPointerDown={onThumb}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  )
}
