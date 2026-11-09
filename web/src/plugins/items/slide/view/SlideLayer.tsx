// スライドのレイヤー（スロット book-layers に置くウィジェット）: 紙の枠の中に、開いたページの slide のアイテムを重ねの順に描き、選ぶ・動かす・大きさを変える・回す・置く・文字の書き換えを受ける。
// ブックのタイプが slide を選んでいるブックだけで描く（選んでいなければ何も出さない）。ポインタを受けるのは、アイテムと選んだ物のつまみ・バーの上と、置こうとしている間の紙の上、
// 置けるアイテムが slide だけのタイプでは何も無い所も（選びを外す）。それ以外はステージ（と下のレイヤー）へ通す。
// アイテムは書いた位置と大きさ（紙の左上から。負でも、紙より大きくてもよい）に置き、角度（rotation）は枠の中心でかける。紙の外にはみ出た部分は切る（切るのはアイテムを描く所だけで、選んだ物のつまみは切らない）。
// 置こうとしている間は、紙の上でドラッグした四角（直線は線、自由な線はなぞった跡）に置く。押しただけなら、そのアイテムの置くときの大きさで押した所に置く。文字枠を置いたら、そのまま文字を打てる。
// アイテムを押すと選び（1 つだけ）、ドラッグで動かす。選んだアイテムは 8 つのつまみで大きさを変え（角は枠と文字を一緒に、辺は幅か高さだけ）、
// 右上の角の斜め外のつまみで回す（Shift で 15 度ずつ）。ロック中のアイテムは縦横の比を保つ。文字枠はダブルクリックで文字を書き換える（外を押すと決め、Escape でやめる）。
// ドラッグの途中の様子はビューに持ち、離したときに 1 回だけコマンドを呼ぶ（元に戻すのも 1 回）
import { type PointerEvent, useEffect, useRef, useState } from "react"
import {
  bookType,
  type ItemId,
  type PlacedShape,
  type Point,
  type Rect,
  type StageView,
  slideOf,
} from "../../../../plugin-api"
import {
  useActions,
  useCommand,
  useCoreCatalog,
  useShownBook,
  useShownPage,
  useStage,
  useToPaper,
} from "../../../../plugin-api/ui"
import { PaperFrame, type StageSlotProps, useFollowsSelection } from "../../../base/ui"
import { SLIDE_MOVE_TO, SLIDE_PUT, SLIDE_RESHAPE, SLIDE_SET } from "../commands"
import { drawnRect, type Grip, resizedRect, rotatedTo, scaledFontSize, thinned } from "../rect"
import { ADDED_EDIT, SLIDE_KEY_SCOPE } from "../scope"
import { DEFAULT_FONT_SIZE, FREE_LINE, MIN_SIZE, STRAIGHT_LINE, TEXT_FRAME } from "../slide"
import { GRIPS, type SelectedItem, Selection } from "./Selection"
import { rotationOf, SlideItem, shapeProps } from "./SlideItem"
import styles from "./SlideLayer.module.css"

// 押しただけとみなす動き（紙の上の px）と、自由な線の点の間引きの間
const CLICK = 4
const THIN = 3

const TEXT = TEXT_FRAME.id
const FREE = FREE_LINE.id
const LINE = STRAIGHT_LINE.id

type Drag =
  | { kind: "move"; pointer: number; item: string; start: Point; rect: Rect; travelled: boolean }
  | {
      kind: "grip"
      pointer: number
      item: string
      start: Point
      rect: Rect
      rotation: number
      grip: Grip
      ratio: number | undefined
      min: number
      text: boolean
    }
  | { kind: "rotate"; pointer: number; item: string; start: Point; center: Point; rotation: number; rect: Rect }
  | { kind: "draw"; pointer: number; item: ItemId; start: Point }

// ドラッグの途中の様子（離すまで、アクションは呼ばない）
interface Live {
  item: string
  rect: Rect
  rotation?: number
  scaled?: boolean
}

const rectOf = (shape: PlacedShape): Rect => ({ x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 })
const round = (n: number): number => Math.round(n * 100) / 100
const roundRect = (f: Rect): Rect => ({ x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h) })

export function SlideLayer({ stage: id }: StageSlotProps) {
  const stage = useStage(id)
  const catalog = useCoreCatalog()
  const type = stage?.opened?.type
  const slide = type ? bookType(catalog, type).slide : undefined
  if (!stage || !slide || stage.opened?.page == null) return null
  // 置けるアイテムが slide だけのタイプは、紙の何も無い所の押しも受ける（選びを外す）。ほかのタイプは、置こうとしている間だけ紙の上を受ける
  const owns = bookType(catalog, type as string).items.allowed.length === 0
  return <SlidePageView stage={stage} owns={owns} placeable={slide.allowed} />
}

function SlidePageView({ stage, owns, placeable }: { stage: StageView; owns: boolean; placeable: readonly string[] }) {
  const book = useShownBook(stage.id)
  const page = useShownPage(stage.id)
  const catalog = useCoreCatalog()
  const followed = useFollowsSelection(stage.id)
  const toPaperAt = useToPaper(stage.id)
  const { select, setEditing, continueStep } = useActions()
  const put = useCommand(stage.id, SLIDE_PUT.id)
  const moveTo = useCommand(stage.id, SLIDE_MOVE_TO.id)
  const reshape = useCommand(stage.id, SLIDE_RESHAPE.id)
  const set = useCommand(stage.id, SLIDE_SET.id)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [drawn, setDrawn] = useState<Point[] | null>(null) // 置こうとしてなぞっている途中の点（紙の上）
  const typeNext = useRef(false) // 置いた文字枠で、そのまま文字を打つ
  const shapes = page ? slideOf(page) : []
  const selected = stage.selection.length === 1 ? shapes.find(s => s.id === stage.selection[0]) : undefined
  const placing = stage.placing !== null && placeable.includes(stage.placing) ? stage.placing : null
  const editing = stage.editing === true || stage.editing === ADDED_EDIT ? (selected?.id ?? null) : null // 文字を書き換えているアイテム（選んでいる 1 つ）
  const minOf = (item: string): number => {
    const def = catalog.items.get(item)
    return def?.kind === "shape" && def.min ? Math.max(def.min.w, def.min.h) : MIN_SIZE
  }

  // 置いたばかりの文字枠が選ばれたら、そのまま文字を書く
  useEffect(() => {
    if (typeNext.current && selected && selected.item === TEXT) {
      typeNext.current = false
      setEditing(stage.id, ADDED_EDIT)
    }
  }, [selected, stage.id, setEditing])

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
      if (!put.enabled) return
      e.preventDefault()
      capture()
      drag.current = { kind: "draw", pointer: e.pointerId, item: placing, start: at }
      setDrawn([at])
      return
    }
    const gripEl = target.closest<HTMLElement>("[data-grip]")
    if (gripEl && selected && !followed && reshape.enabled) {
      e.preventDefault()
      capture()
      const found = GRIPS.find(g => g.id === gripEl.dataset.grip)
      const rect = rectOf(selected)
      const locked = shapeProps(selected).lockRatio === true
      drag.current = {
        kind: "grip",
        pointer: e.pointerId,
        item: selected.id,
        start: at,
        rect,
        rotation: rotationOf(selected),
        grip: found?.grip ?? {},
        ratio: locked ? rect.w / rect.h : undefined,
        min: minOf(selected.item),
        text: selected.item === TEXT,
      }
      return
    }
    if (target.closest("[data-rotate]") && selected && !followed && set.enabled) {
      e.preventDefault()
      capture()
      const rect = rectOf(selected)
      drag.current = {
        kind: "rotate",
        pointer: e.pointerId,
        item: selected.id,
        start: at,
        center: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
        rotation: rotationOf(selected),
        rect,
      }
      return
    }
    const itemEl = target.closest<HTMLElement>("[data-item]")
    const shape = itemEl && shapes.find(s => s.id === itemEl.dataset.item)
    if (shape) {
      select(stage.id, [shape.id])
      if (followed || !moveTo.enabled) return
      capture()
      drag.current = {
        kind: "move",
        pointer: e.pointerId,
        item: shape.id,
        start: at,
        rect: rectOf(shape),
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
      setLive({ item: d.item, rect: { ...d.rect, x: d.rect.x + by.x, y: d.rect.y + by.y } })
    } else if (d.kind === "grip") {
      const to = resizedRect(d.rect, d.rotation, d.grip, by, d.min, d.ratio)
      setLive({ item: d.item, rect: to, scaled: to.scaled && d.text })
    } else if (d.kind === "rotate") {
      const rotation = rotatedTo(d.rotation, d.center, d.start, at, e.shiftKey ? 15 : undefined)
      setLive({ item: d.item, rect: d.rect, rotation })
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
      moveTo.run({ item: d.item, at: { x: round(l.rect.x), y: round(l.rect.y) } })
    else if (d.kind === "grip" && l) reshape.run({ item: d.item, rect: roundRect(l.rect), scaled: l.scaled === true })
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
      const { rect, fractions } = drawnRect(dense.slice(0, 500), minOf(item))
      const props = item === FREE ? { points: fractions } : { from: fractions[0], to: fractions.at(-1) }
      put.run({ item, rect: roundRect(rect), props })
      return
    }
    const rect = moved
      ? drawnRect([from, to], minOf(item)).rect
      : { x: from.x, y: from.y, w: def.size.w, h: def.size.h }
    if (item === TEXT) typeNext.current = true
    put.run({ item, rect: roundRect(rect), props: item === TEXT ? { text: "" } : {} })
  }
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-item]")
    const shape = el && shapes.find(s => s.id === el.dataset.item)
    if (shape?.item === TEXT && set.enabled && !followed) {
      select(stage.id, [shape.id])
      setEditing(stage.id, true)
    }
  }

  // 描く形（ドラッグの途中のアイテムは、動かした先の枠・角度で。角のつまみなら文字の大きさも）
  const shown = shapes.map(s => {
    if (!live || live.item !== s.id) return s
    const props = shapeProps(s)
    const scaledSize =
      live.scaled && s.item === TEXT && s.w
        ? { fontSize: scaledFontSize((props.fontSize as number | undefined) ?? DEFAULT_FONT_SIZE, live.rect.w, s.w) }
        : {}
    return {
      ...s,
      ...live.rect,
      props: { ...props, ...scaledSize, ...(live.rotation === undefined ? {} : { rotation: live.rotation }) },
    } as PlacedShape
  })
  const current = selected && shown.find(s => s.id === selected.id)
  const ghost = drawn && placing ? { item: placing, points: drawn } : null
  const item: SelectedItem | null = current
    ? {
        id: current.id,
        stage: stage.id,
        rect: rectOf(current),
        rotation: rotationOf(current),
        locked: shapeProps(current).lockRatio === true,
        ratio: shapeProps(current).ratio as number | undefined,
        kind: current.item,
        props: shapeProps(current),
      }
    : null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 選ぶ・動かす・大きさを変える・回すのはポインタの操作で、キーの操作はコマンドとキーバインドが受ける
    <div
      ref={ref}
      className={styles.layer}
      tabIndex={-1}
      data-key-scope={SLIDE_KEY_SCOPE.id}
      data-placing={placing !== null}
      data-active={owns || placing !== null}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onDoubleClick={onDoubleClick}
    >
      <PaperFrame stage={stage} className={styles.paper} aria-hidden="true">
        <div className={styles.clip}>
          {shown.map(shape => (
            <SlideItem
              key={shape.id}
              shape={shape}
              stage={stage.id}
              zoom={stage.zoom}
              edit={{
                editing: editing === shape.id,
                onCommit: text => {
                  if (stage.editing === ADDED_EDIT && book) continueStep(book.id)
                  setEditing(stage.id, false)
                  if (text !== (shapeProps(shape).text ?? "")) set.run({ item: shape.id, props: { text } })
                },
                onCancel: () => setEditing(stage.id, false),
              }}
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
