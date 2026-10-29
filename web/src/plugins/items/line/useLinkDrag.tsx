// 形の〇から線を引くドラッグ（線の層が使う）: 押すと、〇の中心からポインタまで途中の線を伸ばし、ポインタの下の引ける相手を覚え、
// 離すとその相手に引く（コマンド line-draw）。何も無い所・引けない相手の上で離す、Escape、3px 未満しか動かさないときは引かない。
// ドラッグの間の途中の線の先と相手だけをビューに持つ
import { type PointerEvent, useEffect, useRef, useState } from "react"
import { type CoreCatalog, type ItemPage, type Point, type Rect, type StageView, toPaper } from "../../../plugin-api"
import { useCommand } from "../../../plugin-api/ui"
import { LINE_DRAW } from "./commands"
import { portAt, targetsFrom } from "./connect"
import type { Side } from "./route"

// 引いているドラッグ: 引き始めた形と辺、引ける相手、押したときのポインタの位置
export interface Link {
  pointer: number
  from: string
  side: Side
  targets: ReadonlySet<string>
  start: Point
}

const SLOP = 3

export function useLinkDrag(
  stage: StageView,
  catalog: CoreCatalog,
  localOf: (e: PointerEvent<Element>) => Point | null,
) {
  const draw = useCommand(stage.id, LINE_DRAW.id)
  const link = useRef<Link | null>(null)
  const [tip, setTip] = useState<{ at: Point; target: string | null } | null>(null) // 途中の線の先（紙の上）と、その下の引ける相手
  const active = tip !== null
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      link.current = null
      setTip(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active])
  return {
    link: active ? link.current : null, // 引いているドラッグ（引いていなければ null）
    usable: draw.enabled, // 線を引けるか（認可ステップが止めていれば引けない）
    tip,
    start(e: PointerEvent<Element>, page: ItemPage, rect: Rect, from: string, side: Side) {
      if (e.button !== 0 || !draw.enabled) return
      e.stopPropagation()
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      link.current = {
        pointer: e.pointerId,
        from,
        side,
        targets: targetsFrom(catalog, page, from),
        start: { x: e.clientX, y: e.clientY },
      }
      setTip({ at: portAt(rect, side, 0), target: null })
    },
    move(e: PointerEvent<Element>) {
      const l = link.current
      const at = l?.pointer === e.pointerId ? localOf(e) : null
      const on = at && toPaper(stage, at)
      if (!l || !on) return
      // ポインタの下の、一番手前の形（線は飛ばす）。引ける相手でなければ相手は無し
      const shape = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map(el => el.closest<HTMLElement>("[data-shape]")?.dataset.item)
        .find(id => id !== undefined)
      setTip({ at: on, target: shape && l.targets.has(shape) ? shape : null })
    },
    end(e: PointerEvent<Element>, drop: boolean) {
      const l = link.current
      if (l?.pointer !== e.pointerId) return
      link.current = null
      const target = tip?.target
      setTip(null)
      const at = localOf(e)
      const moved = Math.abs(e.clientX - l.start.x) > SLOP || Math.abs(e.clientY - l.start.y) > SLOP
      if (drop && moved && target && at) draw.run({ from: l.from, side: l.side, to: target, at })
    },
  }
}
