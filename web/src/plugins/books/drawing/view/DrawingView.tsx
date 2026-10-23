// 図面のブックのビュー: ステージの紙の置き場所（core/stage.ts の placement）に紙を描き、その上に開いたページのアイテムを置く。
// ページが無ければ、真ん中にページを作るボタン（コマンド page.new）を出す。表に無い紙は代わりの紙に「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、図面のメニュー（drawing.context）を開く。
// アイテムを置こうとしている間は、ポインタに点線の箱が付いてきて、押すとそこに置く（drawing.place。紙からはみ出す所では薄く出し、置かない）。
// 選択の道具では、アイテムを押すと選び、ドラッグで動かす（離したときに drawing.move）。ドラッグ中は、動かすアイテムを少し透かしてポインタに付け、
// ほかのアイテムは薄くして動かさない。アイテム 1 つなら、通り道（items.ts の trackDrag）を覚え、正面から半分入った相手をその場で入れ替えて描く（dragging）。ダブルクリックで中身を編集する（drawing.edit）。何も無い所を押すと選択を外す。
// アイテムを右クリックすると、そのアイテムを選んで（選んでいたなら選択はそのまま）アイテムのメニュー（item.context）を開く。
// アイテムを 1 つだけ選んでいて、そのアイテムの大きさを変えられるなら、四辺と四隅をつかんで大きさを変えられる（印は出さず、ポインタの形だけが変わる。
// 辺はその辺だけ、角は 2 つの辺を動かす。離したときに drawing.resize。つかんで動かしている間は、ほかのアイテムを薄くする）。
// 編集のダイアログで選んだ値（下書き）は、決める前から箱に重ねて描く。
// 線は形より手前の層に、描いている形の四角（下書き・ドラッグでずらした所も）から道筋を決めて描く（line/drawn.ts の drawLines）。
// 選択の道具で線を押すと線を選び、ダブルクリックで線の編集のダイアログ（line.edit）、右クリックで線を選んで線のメニュー（line.context）を開く。
// 1 本だけ選んだ線は、端・途中の区間・キャプションの札をドラッグしてじかに直せる（line/useLineEdit.ts）。
// ドラッグの途中の動いた量と、点線の箱のポインタの位置だけはビューに持つ
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import type { Point } from "../../../../core/geom"
import type { BookOf } from "../../../../core/schema/book"
import type { Stage } from "../../../../core/stage"
import { paperOf, placement, toPaper, toPaperDelta } from "../../../../core/stage"
import { toolOf } from "../../../../core/workspace"
import { useCommand } from "../../../../ui/commands"
import { useContextMenu } from "../../../../ui/context-menu"
import { useT } from "../../../../ui/i18n"
import type { BookViewProps, ItemViewProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry, useUi } from "../../../../ui/store-context"
import {
  type Came,
  dragging,
  type Edges,
  fitsPaper,
  itemSize,
  minSize,
  type Placed,
  placeAt,
  placedSize,
  resizedBy,
  shapesOf,
  trackDrag,
} from "../items"
import { PORT_OUT, portAt, SIDES, targetsFrom } from "../line/connect"
import { drawLines } from "../line/drawn"
import { LinesView } from "../line/LinesView"
import { LinkPreview, Ports } from "../line/PortsView"
import type { PlacedLine } from "../line/placed"
import type { Side } from "../line/route"
import { useLineEdit } from "../line/useLineEdit"
import { elbowOf, linesOf } from "../placed"
import styles from "./DrawingView.module.css"

// 要素の左上から見たポインタの位置
const local = (e: PointerEvent<Element>, el: Element): Point => {
  const r = el.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

export function DrawingView({ stage }: BookViewProps) {
  const openMenu = useContextMenu(stage.id, "drawing.context")
  const place = useCommand(stage.id, "drawing.place")
  const { select } = useActions()
  const ref = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const placing = stage.placing !== null
  const registry = useRegistry()
  const hand = useApp(s => toolOf(registry, s.workspace, stage.id) === "hand")

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (placing && ref.current) setPointer(local(e, ref.current))
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ref.current) return
    if (placing) {
      e.preventDefault() // 置いて開いたダイアログから、押した続きで焦点を移さない
      place.run(local(e, ref.current))
    } else if (!hand && !(e.target as Element).closest("[data-item]")) select(stage.id, [])
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 押した所に置く・選択を外すのはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div
      ref={ref}
      className={styles.drawing}
      data-placing={placing}
      onContextMenu={e => openMenu(e, {})}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setPointer(null)}
      onPointerDown={onPointerDown}
    >
      <Content stage={stage} pointer={placing ? pointer : null} localOf={e => ref.current && local(e, ref.current)} />
    </div>
  )
}

// localOf はポインタの位置を、図面のビューの左上から見た位置にする
type LocalOf = (e: PointerEvent<Element>) => Point | null

function Content({ stage, pointer, localOf }: { stage: Stage; pointer: Point | null; localOf: LocalOf }) {
  const t = useT()
  const p = placement(stage)
  const paper = stage.opened?.paper
  if (stage.opened?.page === null) return <NoPages stage={stage} />
  if (paper?.status === "unshowable") return <p className={styles.error}>{t("This paper cannot be shown")}</p>
  if (!p) return null
  return (
    <div
      className={styles.paper}
      role="img"
      aria-label={t("Paper")}
      style={
        {
          width: p.w,
          height: p.h,
          transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})`,
          "--paper-zoom": p.zoom,
        } as CSSProperties
      }
    >
      {paper?.status === "unknown" && <span className={styles.unknown}>{t("Unknown paper")}</span>}
      <Items stage={stage} localOf={localOf} />
      {pointer && <Ghost stage={stage} pointer={pointer} />}
    </div>
  )
}

// ドラッグ中のポインタと、押した位置・動かすアイテム。アイテム 1 つなら、通り道で覚えた相手ごとの先端が来た向きと、前に覚えたときの動いた量（紙の上）
interface Drag {
  pointer: number
  start: Point
  items: readonly string[]
  came: Came
  prev: Point
}

// 大きさを変えているドラッグ: つかんだ辺と、押したときのポインタの位置
interface Stretch {
  pointer: number
  item: string
  edges: Edges
  start: Point
}

// 〇から線を引いているドラッグ: 引き始めた形と辺、引ける相手、押したときのポインタの位置
interface Link {
  pointer: number
  from: string
  side: Side
  targets: ReadonlySet<string>
  start: Point
}

// 開いたページのアイテム。ドラッグ中は、動かすアイテムを動いた量だけずらして描く
function Items({ stage, localOf }: { stage: Stage; localOf: LocalOf }) {
  const page = useApp(s => {
    const o = stage.opened
    const book = o ? (s.books[o.book] as BookOf<"drawing"> | undefined) : undefined
    return book?.pages.find(pg => pg.id === o?.page)
  })
  const move = useCommand(stage.id, "drawing.move")
  const edit = useCommand(stage.id, "drawing.edit")
  const openMenu = useContextMenu(stage.id, "item.context")
  const openLineMenu = useContextMenu(stage.id, "line.context")
  const { select } = useActions()
  const drag = useRef<Drag | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  const resize = useCommand(stage.id, "drawing.resize")
  const preview = useApp(s => s.dialog?.preview ?? null)
  const stretch = useRef<Stretch | null>(null)
  const [stretched, setStretched] = useState<Point>({ x: 0, y: 0 }) // 大きさを変えているドラッグの、画面の上で動いた量
  const registry = useRegistry()
  const hand = useApp(s => toolOf(registry, s.workspace, stage.id) === "hand")
  const draw = useCommand(stage.id, "line.draw")
  const lineEdit = useCommand(stage.id, "line.edit")
  const [hover, setHover] = useState<string | null>(null) // ポインタを乗せている形（〇を出す）
  const link = useRef<Link | null>(null)
  const [linkAt, setLinkAt] = useState<{ at: Point; target: string | null } | null>(null) // 線の先（紙の上）と、その下の引ける相手
  const linking = linkAt !== null
  const lineDrag = useLineEdit(stage, registry, localOf)
  useEffect(() => {
    if (!linking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      link.current = null
      setLinkAt(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [linking])
  if (!page) return null

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0 || hand || stage.placing !== null) return
    const items = stage.selection.includes(id) ? stage.selection : [id]
    select(stage.id, items)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      pointer: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      items,
      came: {},
      prev: { x: 0, y: 0 },
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    const screen = { x: e.clientX - d.start.x, y: e.clientY - d.start.y }
    const by = toPaperDelta(stage, screen)
    if (d.items.length === 1) d.came = trackDrag(registry, page, d.items[0] as string, d.prev, by, d.came)
    d.prev = by
    setMoved(screen)
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    drag.current = null
    setMoved(null)
    if (drop && moved && (moved.x !== 0 || moved.y !== 0)) move.run({ items: d.items, by: moved, came: d.came })
  }
  const shift = moved && toPaperDelta(stage, moved)
  const d = drag.current
  const dragged = shift && d ? d.items : []
  const plan = shift && d?.items.length === 1 ? dragging(registry, page, d.items[0] as string, shift, d.came) : null
  // ドラッグ中にずらして描く量（紙の上）
  const shiftOf = (item: Placed): Point | null => {
    if (!shift) return null
    const r = plan?.get(item.id)
    if (r) return r.x !== item.x || r.y !== item.y ? { x: r.x - item.x, y: r.y - item.y } : null
    return dragged.includes(item.id) ? shift : null
  }

  const startStretch = (e: PointerEvent<HTMLDivElement>, item: string, edges: Edges) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    stretch.current = { pointer: e.pointerId, item, edges, start: { x: e.clientX, y: e.clientY } }
  }
  const moveStretch = (e: PointerEvent<HTMLDivElement>) => {
    const st = stretch.current
    if (st?.pointer === e.pointerId) setStretched({ x: e.clientX - st.start.x, y: e.clientY - st.start.y })
  }
  const endStretch = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const st = stretch.current
    if (st?.pointer !== e.pointerId) return
    stretch.current = null
    setStretched({ x: 0, y: 0 })
    if (drop && (stretched.x !== 0 || stretched.y !== 0)) resize.run({ item: st.item, edges: st.edges, by: stretched })
  }
  const paper = paperOf(stage)
  // 大きさを変えている途中のアイテムは、変えたあとの左上と大きさで描く。ダイアログの下書きのあるアイテムは、項目に下書きを重ねて描く（中身の下書きがあれば中身も替える）
  const shown = (placed: Placed): Placed => {
    const item =
      preview?.item !== undefined && preview.book === stage.opened?.book && preview.item === placed.id
        ? ({
            ...placed,
            props: { ...placed.props, ...preview.props },
            ...(preview.content ? { children: preview.content } : {}),
          } as Placed)
        : placed
    const st = stretch.current
    if (!st || st.item !== item.id || !paper) return item
    const to = resizedBy(registry, item, st.edges, toPaperDelta(stage, stretched), paper)
    return to ? { ...item, ...to } : item
  }
  // 〇から線を引く: 押すと途中の線を伸ばし、ポインタの下の引ける相手を覚え、離すとその相手に引く（line.draw）。Escape・相手の無い所で取りやめ
  const startLink = (e: PointerEvent<HTMLDivElement>, from: string, side: Side) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = rects.get(from)
    if (!r) return
    const [x, y] = portAt(r, side, 0)
    link.current = {
      pointer: e.pointerId,
      from,
      side,
      targets: targetsFrom(registry, page, from),
      start: { x: e.clientX, y: e.clientY },
    }
    setLinkAt({ at: { x, y }, target: null })
  }
  const moveLink = (e: PointerEvent<HTMLDivElement>) => {
    const l = link.current
    const at = l?.pointer === e.pointerId ? localOf(e) : null
    const on = at && toPaper(stage, at)
    if (!l || !on) return
    // ポインタの下の、一番手前の形（線は飛ばす）。引ける相手でなければ相手は無し
    const shape = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map(el => el.closest<HTMLElement>("[data-shape]")?.dataset.item)
      .find(id => id !== undefined)
    setLinkAt({ at: on, target: shape && l.targets.has(shape) ? shape : null })
  }
  const endLink = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const l = link.current
    if (l?.pointer !== e.pointerId) return
    link.current = null
    const target = linkAt?.target
    setLinkAt(null)
    const at = localOf(e)
    const moved = Math.abs(e.clientX - l.start.x) > 3 || Math.abs(e.clientY - l.start.y) > 3
    if (drop && moved && target && at) draw.run({ from: l.from, side: l.side, to: target, at })
  }

  // ドラッグ中の見た目: 動かすアイテムは透かし、大きさを変えているアイテムはそのまま、ほかは薄く。線を引いている間は、引ける相手と引き始めた形のほかを薄く
  const resizing = stretch.current && (stretched.x !== 0 || stretched.y !== 0) ? stretch.current.item : null
  const lookOf = (id: string): "lifted" | "faded" | undefined => {
    const l = link.current
    if (linking && l) return id === l.from || l.targets.has(id) ? undefined : "faded"
    if (lineDrag.dimming) return lineDrag.dimming.has(id) ? undefined : "faded"
    if (dragged.length > 0) return dragged.includes(id) ? "lifted" : "faded"
    return resizing && id !== resizing ? "faded" : undefined
  }
  const single = stage.selection.length === 1 && !hand && stage.placing === null
  // 描く形（下書き・大きさを変えている途中・ドラッグでずらした所を重ねたもの）と、その四角から決めた線
  const shapes = shapesOf(page).map(item => ({ item: shown(item), shift: shiftOf(item) }))
  const rects = new Map(
    shapes.flatMap(({ item, shift }) => {
      const size = placedSize(registry, item)
      return size ? [[item.id, { x: item.x + (shift?.x ?? 0), y: item.y + (shift?.y ?? 0), ...size }] as const] : []
    }),
  )
  // ダイアログの下書きのある線は、項目に下書きを重ねて描く。じかに直しているドラッグの線は、その途中の項目で描く
  const drafted = linesOf(page).map(l =>
    lineDrag.draft?.id === l.id
      ? { ...l, props: lineDrag.draft.props }
      : preview?.item === l.id && preview.book === stage.opened?.book
        ? ({ ...l, props: { ...l.props, ...preview.props } } as PlacedLine)
        : l,
  )
  const elbow = elbowOf(page)
  const lines = drawLines(drafted, rects, elbow)
  const selectable = !hand && stage.placing === null
  const scene = { page, lines: drafted, drawn: lines, rects, elbow }
  const only = stage.selection.length === 1 ? stage.selection[0] : undefined
  const editing = selectable && only && drafted.some(l => l.id === only) ? only : null

  // 〇を出す形: 選択の道具で、ポインタを乗せている選んでいない形（ドラッグ・大きさを変えている間は出さない）。線を引いている間は、引き始めた形の押した〇だけ
  const portsOf = (id: string): readonly Side[] => {
    const l = link.current
    if (linking && l) return l.from === id ? [l.side] : []
    const busy = dragged.length > 0 || resizing !== null
    if (!selectable || busy || hover !== id || stage.selection.includes(id) || !targetsFrom(registry, page, id).size)
      return []
    return SIDES
  }
  const from = link.current && rects.get(link.current.from)
  const zoom = placement(stage)?.zoom ?? 1

  const items = shapes.map(({ item, shift }) => (
    <Item
      key={item.id}
      stage={stage.id}
      item={item}
      target={linkAt?.target === item.id || lineDrag.target === item.id}
      onHover={on => setHover(h => (on ? item.id : h === item.id ? null : h))}
      ports={
        <Ports
          sides={portsOf(item.id)}
          active={linking}
          onStart={(e, side) => startLink(e, item.id, side)}
          onPointerMove={moveLink}
          onPointerUp={e => endLink(e, true)}
          onPointerCancel={e => endLink(e, false)}
        />
      }
      stretchable={single && stage.selection[0] === item.id && minSize(item) !== null}
      onStretch={{
        down: (e, edges) => startStretch(e, item.id, edges),
        move: moveStretch,
        up: e => endStretch(e, true),
        cancel: e => endStretch(e, false),
      }}
      selected={stage.selection.includes(item.id)}
      shift={shift}
      look={lookOf(item.id)}
      onPointerDown={e => onPointerDown(e, item.id)}
      onPointerMove={onPointerMove}
      onPointerUp={e => endDrag(e, true)}
      onPointerCancel={e => endDrag(e, false)}
      onDoubleClick={() => {
        if (!hand && stage.placing === null) edit.run({ item: item.id })
      }}
      onContextMenu={e => {
        if (stage.placing !== null) return
        if (!stage.selection.includes(item.id)) select(stage.id, [item.id])
        openMenu(e, { item: item.id })
      }}
    />
  ))
  return (
    <>
      {items}
      <LinesView
        lines={lines}
        selection={stage.selection}
        selectable={selectable}
        onPointerDown={(e, id) => {
          if (e.button !== 0 || !selectable) return
          if (!stage.selection.includes(id)) select(stage.id, [id])
        }}
        onDoubleClick={id => {
          if (selectable) lineEdit.run({ item: id })
        }}
        onContextMenu={(e, id) => {
          if (stage.placing !== null) return
          if (!stage.selection.includes(id)) select(stage.id, [id])
          openLineMenu(e, { item: id })
        }}
        editing={editing}
        snap={lineDrag.snap}
        drag={{
          via: (e, id, index) => lineDrag.startVia(e, id, index),
          end: (e, id, end) => {
            const l = drafted.find(x => x.id === id)
            if (l) lineDrag.startEnd(e, scene, l, end)
          },
          caption: (e, id) => {
            if (e.button !== 0 || !selectable) return
            if (!stage.selection.includes(id)) select(stage.id, [id])
            lineDrag.startCaption(e, id)
          },
          move: e => lineDrag.move(e, scene),
          up: e => lineDrag.end(e, scene, true),
          cancel: e => lineDrag.end(e, scene, false),
        }}
      />
      {linkAt && from && link.current && (
        <LinkPreview from={portAt(from, link.current.side, PORT_OUT / zoom)} to={[linkAt.at.x, linkAt.at.y]} />
      )}
    </>
  )
}

interface ItemProps {
  stage: string
  item: Placed
  target: boolean // 〇から引いている線の、今の相手か
  onHover(on: boolean): void
  ports: ReactNode // 線を引く〇
  stretchable: boolean // 四辺と四隅をつかんで大きさを変えられるか
  onStretch: {
    down(e: PointerEvent<HTMLDivElement>, edges: Edges): void
    move(e: PointerEvent<HTMLDivElement>): void
    up(e: PointerEvent<HTMLDivElement>): void
    cancel(e: PointerEvent<HTMLDivElement>): void
  }
  selected: boolean
  shift: Point | null // ドラッグ中にずらして描く量（紙の上）
  look?: "lifted" | "faded" // ドラッグ中の見た目（動かすアイテムは少し透かし、ほかは薄く）
  onPointerDown(e: PointerEvent<HTMLDivElement>): void
  onPointerMove(e: PointerEvent<HTMLDivElement>): void
  onPointerUp(e: PointerEvent<HTMLDivElement>): void
  onPointerCancel(e: PointerEvent<HTMLDivElement>): void
  onDoubleClick(): void
  onContextMenu(e: MouseEvent<HTMLDivElement>): void
}

// 大きさを変えるためにつかめる所: 四辺と四隅（角は 2 つの辺を動かす）
const GRIPS: readonly { at: string; edges: Edges }[] = [
  { at: "left", edges: { x: "left" } },
  { at: "right", edges: { x: "right" } },
  { at: "top", edges: { y: "top" } },
  { at: "bottom", edges: { y: "bottom" } },
  { at: "top-left", edges: { x: "left", y: "top" } },
  { at: "top-right", edges: { x: "right", y: "top" } },
  { at: "bottom-left", edges: { x: "left", y: "bottom" } },
  { at: "bottom-right", edges: { x: "right", y: "bottom" } },
]

// 置いたアイテム 1 つ。結んだビューで描き、ビューの無いアイテムは枠だけを描く
function Item({
  stage,
  item,
  target,
  onHover,
  ports,
  stretchable,
  onStretch,
  selected,
  shift,
  look,
  ...handlers
}: ItemProps) {
  const registry = useRegistry()
  const ui = useUi().items.get(item.item)
  const size = placedSize(registry, item)
  const View = ui?.view as ((p: ItemViewProps<Placed["props"]>) => ReactNode) | undefined
  return (
    <div
      data-item={item.id}
      data-shape
      data-target={target}
      className={styles.item}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      data-selected={selected}
      data-look={look}
      style={{
        left: item.x,
        top: item.y,
        width: size?.w,
        height: size?.h,
        transform: shift ? `translate(${shift.x}px, ${shift.y}px)` : undefined,
      }}
      {...handlers}
    >
      {View && size ? (
        <View
          props={item.props}
          size={size}
          id={item.id}
          stage={stage}
          content={"children" in item ? (item.children ?? []) : []}
        />
      ) : (
        <div className={styles.unknownItem} />
      )}
      {ports}
      {stretchable &&
        GRIPS.map(g => (
          <div
            key={g.at}
            className={styles.grip}
            data-grip={g.at}
            onPointerDown={e => onStretch.down(e, g.edges)}
            onPointerMove={onStretch.move}
            onPointerUp={onStretch.up}
            onPointerCancel={onStretch.cancel}
          />
        ))}
    </div>
  )
}

// 置こうとしているアイテムの点線の箱。紙からはみ出す所では薄く出す
function Ghost({ stage, pointer }: { stage: Stage; pointer: Point }) {
  const registry = useRegistry()
  const at = placeAt({ stage }, pointer)
  const size = stage.placing ? itemSize(registry, stage.placing) : null
  const paper = paperOf(stage)
  if (!at || !size || !paper) return null
  return (
    <div
      className={styles.ghost}
      data-fits={fitsPaper(at, size, paper)}
      style={{ left: at.x, top: at.y, width: size.w, height: size.h }}
    />
  )
}

function NoPages({ stage }: { stage: Stage }) {
  const t = useT()
  const newPage = useCommand(stage.id, "page.new")
  return (
    <div className={styles.empty}>
      <p className={styles.prompt}>{t("No pages")}</p>
      {newPage.shown && (
        <button type="button" className={styles.create} onClick={() => newPage.run()}>
          {t("Create page")}
        </button>
      )}
    </div>
  )
}
