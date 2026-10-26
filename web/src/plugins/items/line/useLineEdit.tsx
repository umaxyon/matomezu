// 選んだ線をじかに直すドラッグ（線の層が使う）: 途中の区間・端・キャプションの札。
// ドラッグの間は、動かした線の項目（下書き）と吸い付いた点・つなぎ替えの相手だけをビューに持ち、離したときに書く
// （区間・端・札はアクション line-update、ほかの形の上で離した端はコマンド line-drop でつなぎ替え）。項目は edit.ts の純粋な関数で決める。
// 端を運ぶ間は、つなぎ替えられる形と今の形のほかを薄くし、ポインタの下のつなぎ替えられる形を相手として強調する。Escape で取りやめ
import { type PointerEvent, useEffect, useRef, useState } from "react"
import { type CoreCatalog, type ItemPage, type Point, type Stage, toPaper } from "../../../plugin-api"
import { useActions, useCommand } from "../../../plugin-api/ui"
import { reconnectTargets } from "./connect"
import type { DrawnLine } from "./drawn"
import { captionDragged, endDragged, viaDragged, viaSettled } from "./edit"
import type { Rect } from "./geom"
import type { PlacedLine } from "./placed"

type Props = PlacedLine["props"]
export type LineEnd = "from" | "to"

type Kind =
  | { kind: "via"; index: number }
  | { kind: "end"; end: LineEnd; targets: ReadonlySet<string> }
  | { kind: "caption" }

interface Drag {
  pointer: number
  line: string
  start: Point // 押したときのポインタ（画面）
  moved: boolean
  what: Kind
}

// 描いている線の今の様子（ドラッグの一歩ごとに、ビューが描いたものを渡す）
export interface LineScene {
  page: ItemPage
  lines: readonly PlacedLine[] // 下書きを重ねたページの線
  drawn: readonly DrawnLine[]
  rects: ReadonlyMap<string, Rect>
  elbow: boolean
}

const SLOP = 3 // 札は、これだけ動かすまではドラッグにしない（押して離せば線を選ぶだけ）

export function useLineEdit(stage: Stage, catalog: CoreCatalog, localOf: (e: PointerEvent<Element>) => Point | null) {
  const { perform } = useActions()
  const drop = useCommand(stage.id, "@matomezu/line:line-drop")
  const drag = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<{ id: string; props: Props } | null>(null)
  const [snap, setSnap] = useState<Point | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [dimming, setDimming] = useState<ReadonlySet<string> | null>(null) // 端を運ぶ間、薄くしない形
  const active = draft !== null || dimming !== null
  const clear = () => {
    drag.current = null
    setDraft(null)
    setSnap(null)
    setTarget(null)
    setDimming(null)
  }
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      drag.current = null
      setDraft(null)
      setSnap(null)
      setTarget(null)
      setDimming(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active])

  const paperAt = (e: PointerEvent<Element>): Point | null => {
    const at = localOf(e)
    return at && toPaper(stage, at)
  }
  const begin = (e: PointerEvent<Element>, line: string, what: Kind) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, line, start: { x: e.clientX, y: e.clientY }, moved: false, what }
  }

  return {
    draft, // ドラッグしている線の項目（下書き。描くときに線に重ねる）
    snap, // 端が吸い付いた点
    target, // 端を運んでいる先の、つなぎ替えられる形
    dimming, // 端を運ぶ間、薄くしない形（null ならだれも薄くしない）
    startVia: (e: PointerEvent<Element>, line: string, index: number) => begin(e, line, { kind: "via", index }),
    startEnd: (e: PointerEvent<Element>, scene: LineScene, line: PlacedLine, end: LineEnd) =>
      begin(e, line.id, { kind: "end", end, targets: reconnectTargets(catalog, scene.page, line, end) }),
    startCaption: (e: PointerEvent<Element>, line: string) => begin(e, line, { kind: "caption" }),
    move(e: PointerEvent<Element>, scene: LineScene) {
      const d = drag.current
      const p = d?.pointer === e.pointerId ? paperAt(e) : null
      const line = d && scene.lines.find(l => l.id === d.line)
      const drawn = d && scene.drawn.find(l => l.id === d.line)
      if (!d || !p || !line || !drawn) return
      if (!d.moved && Math.abs(e.clientX - d.start.x) <= SLOP && Math.abs(e.clientY - d.start.y) <= SLOP) return
      d.moved = true
      const w = d.what
      if (w.kind === "via") {
        const seg = drawn.segments.find(s => s.index === w.index)
        const props = seg && viaDragged(line, drawn, scene.rects, w.index, p[seg.axis])
        if (props) setDraft({ id: line.id, props })
      } else if (w.kind === "caption") {
        setDraft({ id: line.id, props: captionDragged(line, drawn.points, p) })
      } else {
        const own = line[w.end]
        if (w.targets.size > 0) setDimming(new Set([...w.targets, own]))
        // ポインタの下の一番手前の形が、つなぎ替えられる形なら相手にする（今の形の上や何も無い所では、端を今の形のふちに沿って動かす）
        const shape = document
          .elementsFromPoint(e.clientX, e.clientY)
          .map(el => el.closest<HTMLElement>("[data-shape]")?.dataset.item)
          .find(id => id !== undefined)
        const to = shape && w.targets.has(shape) ? shape : null
        setTarget(to)
        if (to) return setSnap(null)
        const done = endDragged(line, w.end === "from" ? "exit" : "enter", scene.lines, scene.drawn, scene.rects, p)
        if (!done) return
        setDraft({ id: line.id, props: done.props })
        setSnap(done.snap)
      }
    },
    end(e: PointerEvent<Element>, scene: LineScene, commit: boolean) {
      const d = drag.current
      if (d?.pointer !== e.pointerId) return
      const book = stage.opened?.book
      const at = localOf(e)
      const line = scene.lines.find(l => l.id === d.line)
      const drawn = scene.drawn.find(l => l.id === d.line)
      const to = target
      clear()
      if (!commit || !d.moved || !book || !line || !drawn) return
      const w = d.what
      if (w.kind === "end" && to && at) return drop.run({ line: line.id, end: w.end, item: to, at })
      const props = w.kind === "via" ? viaSettled(line, drawn, scene.rects, scene.elbow) : line.props
      const keys =
        w.kind === "via"
          ? (["via", "exitAt", "enterAt"] as const)
          : w.kind === "caption"
            ? (["captionAt", "captionOffset"] as const)
            : ([w.end === "from" ? "exitAt" : "enterAt"] as const)
      const patch = Object.fromEntries(keys.map(k => [k, props[k] ?? null]))
      perform("@matomezu/line:line-update", { page: scene.page.id, line: line.id, props: patch }, { book })
    },
  }
}
