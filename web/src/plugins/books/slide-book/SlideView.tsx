// スライドのビュー（見せ方 slide）: ブックのビューのレイヤー（book-content）が描く。紙の枠の中に、開いたページの slide のアイテムを重ねの順に描く。
// アイテムは書いた位置と大きさ（紙の左上から。負でも、紙より大きくてもよい）に置き、角度（rotation）は枠の中心でかける。紙の外にはみ出た部分は切る（切る層はアイテムだけで、選んだ物のつまみは切らない）。
// 置こうとしている間は、紙の上でドラッグした四角（直線は線、自由な線はなぞった跡）に置く。押しただけなら、そのアイテムの置くときの大きさで押した所に置く。文字枠を置いたら、そのまま文字を打てる。
// アイテムを押すと選び（1 つだけ）、ドラッグで動かす。選んだアイテムは 8 つのつまみで大きさを変え（角は枠と文字を一緒に、辺は幅か高さだけ）、
// 右上の角の斜め外のつまみで回す（Shift で 15 度ずつ）。ロック中のアイテムは縦横の比を保つ。文字枠はダブルクリックで文字を書き換える（外を押すと決め、Escape でやめる）。
// ドラッグの途中の様子はビューに持ち、離したときに 1 回だけコマンドを呼ぶ（元に戻すのも 1 回）
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { type ItemId, type PlacedShape, type Point, type StageView, slideOf } from "../../../plugin-api"
import {
  type BookViewProps,
  type ItemViewProps,
  useActions,
  useCommand,
  useCoreCatalog,
  useMessages,
  useShownPage,
  useStage,
  useToPaper,
  useUiCatalog,
} from "../../../plugin-api/ui"
import { PaperFrame } from "../../base/ui"
import { drawnFrame, type Frame, type Grip, resizeFrame, rotatedTo, thinned } from "./frame"
import { kit } from "./kit"
import { GRIPS, type SelectedItem, Selection } from "./Selection"
import styles from "./SlideView.module.css"
import { SLIDE_KEY_SCOPE } from "./slide-book"

// 幅・高さの下限と、押しただけとみなす動き（紙の上の px）、自由な線の点の間引きの間
const MIN = 8
const CLICK = 4
const THIN = 3

const TEXT = "@matomezu/slide:slide-text"
const FREE = "@matomezu/slide:slide-free-line"
const LINE = "@matomezu/slide:slide-line"

type Drag =
  | { kind: "move"; pointer: number; item: string; start: Point; frame: Frame; travelled: boolean }
  | {
      kind: "grip"
      pointer: number
      item: string
      start: Point
      frame: Frame
      rotation: number
      grip: Grip
      ratio: number | undefined
      text: boolean
    }
  | { kind: "rotate"; pointer: number; item: string; start: Point; center: Point; rotation: number; frame: Frame }
  | { kind: "draw"; pointer: number; item: ItemId; start: Point }

// ドラッグの途中の様子（離すまで、アクションは呼ばない）
interface Live {
  item: string
  frame: Frame
  rotation?: number
  scaled?: boolean
}

const shapeProps = (shape: PlacedShape): Record<string, unknown> => shape.props as Record<string, unknown>
const rotationOf = (shape: PlacedShape): number => (shapeProps(shape).rotation as number | undefined) ?? 0
const frameOf = (shape: PlacedShape): Frame => ({ x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 })
const round = (n: number): number => Math.round(n * 100) / 100
const roundFrame = (f: Frame): Frame => ({ x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h) })

export function SlideView({ stage: id }: BookViewProps) {
  const stage = useStage(id)
  if (!stage) return null
  return <Page stage={stage} />
}

function Page({ stage }: { stage: StageView }) {
  const t = useMessages(kit)
  const page = useShownPage(stage.id)
  const catalog = useCoreCatalog()
  const ui = useUiCatalog()
  const toPaperAt = useToPaper(stage.id)
  const { select } = useActions()
  const put = useCommand(stage.id, "@matomezu/slide-book:slide-put")
  const moveTo = useCommand(stage.id, "@matomezu/slide-book:slide-move-to")
  const reshape = useCommand(stage.id, "@matomezu/slide-book:slide-reshape")
  const set = useCommand(stage.id, "@matomezu/slide-book:slide-set")
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [drawn, setDrawn] = useState<Point[] | null>(null) // 置こうとしてなぞっている途中の点（紙の上）
  const [editing, setEditing] = useState<string | null>(null)
  const typeNext = useRef(false) // 置いた文字枠で、そのまま文字を打つ
  const shapes = page ? slideOf(page) : []
  const selected = stage.selection.length === 1 ? shapes.find(s => s.id === stage.selection[0]) : undefined
  const placing = stage.placing

  // 置いたばかりの文字枠が選ばれたら、そのまま文字を書く
  useEffect(() => {
    if (typeNext.current && selected && selected.item === TEXT) {
      typeNext.current = false
      setEditing(selected.id)
    }
  }, [selected])
  // 選びなおすと、文字を書くのは終わる
  useEffect(() => {
    if (editing !== null && selected?.id !== editing) setEditing(null)
  }, [selected, editing])

  const paperAt = (e: PointerEvent<Element>): Point | null => {
    const el = ref.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return toPaperAt({ x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const finish = () => {
    drag.current = null
    setLive(null)
    setDrawn(null)
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || stage.pans) return
    const target = e.target as Element
    if (target.closest("[data-bar], textarea")) return
    e.currentTarget.focus({ preventScroll: true }) // 消すキーは、このビューが焦点を持つ間に効く
    const at = paperAt(e)
    if (!at) return
    const capture = () => e.currentTarget.setPointerCapture(e.pointerId)
    if (placing) {
      e.preventDefault()
      capture()
      drag.current = { kind: "draw", pointer: e.pointerId, item: placing, start: at }
      setDrawn([at])
      return
    }
    const gripEl = target.closest<HTMLElement>("[data-grip]")
    if (gripEl && selected) {
      e.preventDefault()
      capture()
      const found = GRIPS.find(g => g.id === gripEl.dataset.grip)
      const frame = frameOf(selected)
      const locked = shapeProps(selected).lockRatio === true
      drag.current = {
        kind: "grip",
        pointer: e.pointerId,
        item: selected.id,
        start: at,
        frame,
        rotation: rotationOf(selected),
        grip: found?.grip ?? {},
        ratio: locked ? frame.w / frame.h : undefined,
        text: selected.item === TEXT,
      }
      return
    }
    if (target.closest("[data-rotate]") && selected) {
      e.preventDefault()
      capture()
      const frame = frameOf(selected)
      drag.current = {
        kind: "rotate",
        pointer: e.pointerId,
        item: selected.id,
        start: at,
        center: { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 },
        rotation: rotationOf(selected),
        frame,
      }
      return
    }
    const itemEl = target.closest<HTMLElement>("[data-item]")
    const shape = itemEl && shapes.find(s => s.id === itemEl.dataset.item)
    if (shape) {
      select(stage.id, [shape.id])
      capture()
      drag.current = {
        kind: "move",
        pointer: e.pointerId,
        item: shape.id,
        start: at,
        frame: frameOf(shape),
        travelled: false,
      }
      return
    }
    select(stage.id, [])
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    if (e.buttons === 0) {
      finish()
      return
    }
    const at = paperAt(e)
    if (!at) return
    const by = { x: at.x - d.start.x, y: at.y - d.start.y }
    if (d.kind === "move") {
      if (!d.travelled && Math.hypot(by.x, by.y) < CLICK / stage.zoom) return
      d.travelled = true
      setLive({ item: d.item, frame: { ...d.frame, x: d.frame.x + by.x, y: d.frame.y + by.y } })
    } else if (d.kind === "grip") {
      const to = resizeFrame(d.frame, d.rotation, d.grip, by, MIN, d.ratio)
      setLive({ item: d.item, frame: to, scaled: to.scaled && d.text })
    } else if (d.kind === "rotate") {
      const rotation = rotatedTo(d.rotation, d.center, d.start, at, e.shiftKey ? 15 : undefined)
      setLive({ item: d.item, frame: d.frame, rotation })
    } else {
      // なぞる点は、自由な線ならすべて、それ以外は始めと今の 2 つ
      setDrawn(now => (d.item === FREE ? [...(now ?? [d.start]), at] : [d.start, at]))
    }
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    const l = live
    const points = drawn
    finish()
    if (d.kind === "move" && l && d.travelled)
      moveTo.run({ item: d.item, at: { x: round(l.frame.x), y: round(l.frame.y) } })
    else if (d.kind === "grip" && l)
      reshape.run({ item: d.item, frame: roundFrame(l.frame), scaled: l.scaled === true })
    else if (d.kind === "rotate" && l && l.rotation !== undefined && l.rotation !== d.rotation)
      set.run({ item: d.item, props: { rotation: l.rotation === 0 ? null : l.rotation } })
    else if (d.kind === "draw" && points) placeDrawn(d.item, points)
  }
  // なぞった点 points に、置こうとしているアイテム item を置く（なぞれていなければ、置くときの大きさで始めの点に置く）
  const placeDrawn = (item: ItemId, points: readonly Point[]) => {
    const def = catalog.items.get(item)
    const from = points[0]
    const to = points.at(-1)
    if (!from || !to || def?.kind !== "shape") return
    const moved = Math.hypot(to.x - from.x, to.y - from.y) >= CLICK / stage.zoom
    if (item === LINE || item === FREE) {
      if (!moved) return
      const dense = item === FREE ? thinned(points, THIN / stage.zoom) : [from, to]
      const { frame, fractions } = drawnFrame(dense.slice(0, 500), MIN)
      const props = item === FREE ? { points: fractions } : { from: fractions[0], to: fractions.at(-1) }
      put.run({ item, frame: roundFrame(frame), props })
      return
    }
    const frame = moved ? drawnFrame([from, to], MIN).frame : { x: from.x, y: from.y, w: def.size.w, h: def.size.h }
    if (item === TEXT) typeNext.current = true
    put.run({ item, frame: roundFrame(frame), props: item === TEXT ? { text: "" } : {} })
  }
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-item]")
    const shape = el && shapes.find(s => s.id === el.dataset.item)
    if (shape?.item === TEXT) {
      select(stage.id, [shape.id])
      setEditing(shape.id)
    }
  }

  if (stage.opened?.page === null) return <p className={styles.empty}>{t("No slides yet")}</p>
  // 描く形（ドラッグの途中のアイテムは、動かした先の枠・角度で。角のつまみなら文字の大きさも）
  const shown = shapes.map(s => {
    if (!live || live.item !== s.id) return s
    const props = shapeProps(s)
    const scaledSize =
      live.scaled && s.item === TEXT && s.w
        ? { fontSize: round((((props.fontSize as number | undefined) ?? 24) * live.frame.w) / s.w) }
        : {}
    return {
      ...s,
      ...live.frame,
      props: { ...props, ...scaledSize, ...(live.rotation === undefined ? {} : { rotation: live.rotation }) },
    } as PlacedShape
  })
  const current = selected && shown.find(s => s.id === selected.id)
  const ghost = drawn && placing ? { item: placing, points: drawn } : null
  const item: SelectedItem | null = current
    ? {
        id: current.id,
        stage: stage.id,
        frame: frameOf(current),
        rotation: rotationOf(current),
        locked: shapeProps(current).lockRatio === true,
        ratio: shapeProps(current).ratio as number | undefined,
      }
    : null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 選ぶ・動かす・大きさを変える・回すのはポインタの操作で、キーの操作はコマンドとキーバインドが受ける
    <div
      ref={ref}
      className={styles.view}
      tabIndex={-1}
      data-key-scope={SLIDE_KEY_SCOPE.id}
      data-placing={placing !== null}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onDoubleClick={onDoubleClick}
    >
      <PaperFrame stage={stage} className={styles.paper} role="img" aria-label={t("Paper")}>
        <div className={styles.clip}>
          {shown.map(shape => (
            <Shape
              key={shape.id}
              shape={shape}
              stage={stage}
              view={ui.items.get(shape.item)?.view}
              editing={editing === shape.id}
              onCommit={text => {
                setEditing(null)
                if (text !== (shapeProps(shape).text ?? "")) set.run({ item: shape.id, props: { text } })
              }}
              onCancel={() => setEditing(null)}
            />
          ))}
          {ghost && <Ghost ghost={ghost} zoom={stage.zoom} />}
        </div>
        {item && !placing && <Selection item={item} hidden={editing !== null} />}
      </PaperFrame>
    </div>
  )
}

// なぞっている途中の見え方: 四角（直線は線、自由な線はなぞった跡）
function Ghost({ ghost, zoom }: { ghost: { item: ItemId; points: readonly Point[] }; zoom: number }) {
  const { item, points } = ghost
  const a = points[0]
  const b = points.at(-1)
  if (!a || !b || points.length < 2) return null
  const stroke = { stroke: "var(--skin-accent)", strokeWidth: 2 / zoom, fill: "none", strokeDasharray: `${6 / zoom}` }
  if (item === FREE || item === LINE) {
    const at = item === FREE ? points : [a, b]
    return (
      <svg className={styles.ghost} aria-hidden="true">
        <polyline points={at.map(p => `${p.x},${p.y}`).join(" ")} {...stroke} />
      </svg>
    )
  }
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return (
    <svg className={styles.ghost} aria-hidden="true">
      <rect x={x} y={y} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} {...stroke} />
    </svg>
  )
}

function Shape({
  shape,
  stage,
  view,
  editing,
  onCommit,
  onCancel,
}: {
  shape: PlacedShape
  stage: StageView
  view: ((p: ItemViewProps<never, never>) => ReactNode) | React.ComponentType<ItemViewProps<never, never>> | undefined
  editing: boolean
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const View = view as React.ComponentType<ItemViewProps<PlacedShape["props"]>> | undefined
  const size = { w: shape.w ?? 0, h: shape.h ?? 0 }
  const rotation = rotationOf(shape)
  return (
    <div
      data-item={shape.id}
      className={styles.item}
      style={{
        left: shape.x,
        top: shape.y,
        width: size.w,
        height: size.h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      {editing ? (
        <TextEditor shape={shape} onCommit={onCommit} onCancel={onCancel} />
      ) : (
        View && (
          <View
            props={shape.props}
            size={size}
            id={shape.id}
            stage={stage.id}
            content={{}}
            zoom={stage.zoom}
            hasChildren={false}
          />
        )
      )}
    </div>
  )
}

// 文字枠の文字を書き換える欄（文字枠と同じ文字の大きさ・そろえ・色）。外へ出ると決め、Escape でやめる
function TextEditor({
  shape,
  onCommit,
  onCancel,
}: {
  shape: PlacedShape
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const props = shape.props as { text?: string; fontSize?: number; align?: "left" | "center" | "right"; color?: string }
  const [text, setText] = useState(props.text ?? "")
  const cancelled = useRef(false)
  return (
    <textarea
      className={styles.editor}
      // biome-ignore lint/a11y/noAutofocus: 文字を書き換え始めたときに、そのまま打てるようにする
      autoFocus
      value={text}
      style={{ fontSize: props.fontSize ?? 24, textAlign: props.align ?? "left" }}
      onFocus={e => e.currentTarget.setSelectionRange(text.length, text.length)}
      onChange={e => setText(e.target.value)}
      onBlur={() => (cancelled.current ? onCancel() : onCommit(text))}
      onKeyDown={e => {
        if (e.key === "Escape") {
          cancelled.current = true
          e.stopPropagation()
          e.currentTarget.blur()
        }
      }}
    />
  )
}
