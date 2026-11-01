// 紙の上の物のドラッグ: start で押した物を覚え、動かすと紙の座標の位置を追い、離したら onDrop に渡す（動かさずに離せば何もしない）。
// 押した所は、ステージ stage の表示領域の要素 area から見た点にして、紙の座標に直す。ポインタが表示領域の端に近い間は、その向きへ紙をずらし続け（edgePanner）、
// 紙がずれたり倍率が変わったりしたら、ポインタの下の紙の所を追い直す。
// 動かし始めたときと、動かしたあと終えたとき（落としても、やめても。落とす前）にすることは、begin・end で渡せる（begin にはポインタの所を、area から見た点で渡す）
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react"
import type { Point } from "../../../core/geom"
import { toPaper } from "../../../core/stage"
import type { StageView } from "../../../core/workspace"
import { useActions } from "../../../ui/store-context"
import { useStagePan, useToPaper } from "../../../ui/view-hooks"
import { edgePanner } from "./edge-pan"

// ドラッグを始めるまでに動かす長さ（画面の px）
const DRAG_START = 4

export interface PaperDrag {
  id: string // 押した物
  from: Point // 押した所（画面の座標）
  grab: Point // 物の左上から、押した所まで（紙の座標）
  at: Point // ポインタの所（紙の座標）
  moved: boolean // DRAG_START より動かしたか
}

export interface PaperDragWays {
  begin?: (pointer: Point) => void
  end?: () => void
}

export function usePaperDrag(stage: StageView, area: RefObject<HTMLElement | null>, ways: PaperDragWays = {}) {
  const { panStageBy } = useActions()
  const [state, setPress] = useState<PaperDrag | null>(null)
  const latest = useRef(state)
  latest.current = state
  const onDrop = useRef<(id: string, at: Point) => void>(() => {})
  const local = (cx: number, cy: number): Point | null => {
    const r = area.current?.getBoundingClientRect()
    return r ? { x: cx - r.left, y: cy - r.top } : null
  }
  const toPaperOf = useToPaper(stage.id)
  const toPaperAt = (cx: number, cy: number): Point | null => {
    const p = local(cx, cy)
    return p ? toPaperOf(p) : null
  }
  const localAt = useEffectEvent(local)
  const paperAt = useEffectEvent(toPaperAt)
  const begin = useEffectEvent((p: Point) => ways.begin?.(p))
  const end = useEffectEvent(() => ways.end?.())
  const id = stage.id
  const pressed = state !== null
  const pointer = useRef<Point | null>(null) // 最後のポインタの所（画面の座標）
  // 紙がずれたり倍率が変わったりしたら（描き直したあとのステージで）、ポインタの下の紙の所を追い直す。
  // 紙をずらす量は押している間だけ追う（押していなければ、ずらしても描き直さない）
  const { opened, zoom } = stage
  const pan = useStagePan(id, pressed)
  useEffect(() => {
    const d = latest.current
    const c = pointer.current
    const p = c && localAt(c.x, c.y)
    if (!d?.moved || !p || !pan) return
    const at = toPaper({ opened, pan, zoom }, p)
    if (at && (at.x !== d.at.x || at.y !== d.at.y)) setPress({ ...d, at })
  }, [opened, pan, zoom])
  useEffect(() => {
    if (!pressed) return
    // 端に近い間、紙をずらし続ける
    const panner = edgePanner(
      () => {
        const r = area.current?.getBoundingClientRect()
        return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      },
      (dx, dy) => panStageBy(id, dx, dy),
    )
    const move = (e: PointerEvent) => {
      const d = latest.current
      if (!d) return
      pointer.current = { x: e.clientX, y: e.clientY }
      if (!d.moved && Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) < DRAG_START) return
      if (!d.moved) {
        const p = localAt(e.clientX, e.clientY)
        if (p) begin(p)
      }
      const at = paperAt(e.clientX, e.clientY)
      if (at) setPress({ ...d, moved: true, at })
      panner.follow(pointer.current)
    }
    const finish = (drop: boolean) => {
      const d = latest.current
      pointer.current = null
      panner.stop()
      setPress(null)
      if (!d?.moved) return
      end()
      if (drop) onDrop.current(d.id, d.at)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      panner.stop()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [pressed, id, area, panStageBy])
  // 押した物 item（id と、紙の座標の左上）と、押した所（画面の座標）
  const start = (item: { id: string; x: number; y: number }, cx: number, cy: number) => {
    const at = toPaperAt(cx, cy)
    if (at)
      setPress({ id: item.id, from: { x: cx, y: cy }, grab: { x: at.x - item.x, y: at.y - item.y }, at, moved: false })
  }
  return { state, start, onDrop }
}
