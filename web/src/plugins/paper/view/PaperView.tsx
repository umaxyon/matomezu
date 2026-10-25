// 紙のビュー（見せ方 paper）: ステージの紙の置き場所（core/stage.ts の placement）に紙を描き、その上に開いたページのアイテムを置く。
// ページが無ければ、真ん中にページを作るボタン（コマンド page.new）を出す。表に無い紙は代わりの紙に「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、紙のメニュー（paper.context）を開く。
// アイテムを置こうとしている間は、ポインタに点線の箱が付いてきて、押すとそこに置く（paper.place。紙からはみ出す所では薄く出し、置かない）。
// 選択の道具では、アイテムを押すと選び、ドラッグで動かす（離したときに paper.move）。ドラッグ中は、動かすアイテムを少し透かしてポインタに付け、
// ほかのアイテムは薄くして動かさない。アイテム 1 つなら、通り道（items.ts の trackDrag）を覚え、正面から半分入った相手をその場で入れ替えて描く（dragging）。ダブルクリックで中身を編集する（paper.edit）。何も無い所を押すと選択を外す。
// アイテムを右クリックすると、そのアイテムを選んで（選んでいたなら選択はそのまま）アイテムのメニュー（item.context）を開く。
// アイテムを 1 つだけ選んでいて、そのアイテムの大きさを変えられるなら、四辺と四隅をつかんで大きさを変えられる（印は出さず、ポインタの形だけが変わる。
// 辺はその辺だけ、角は 2 つの辺を動かす。離したときに paper.resize。つかんで動かしている間は、ほかのアイテムを薄くする）。
// 編集のダイアログで選んだ値（下書き）は、決める前から箱に重ねて描く。
// ブックで使えるつなぐもの（線など）は、そのビュー（ui/connector.ts）の層で形の並びを包み、形ごとに重ねるコンポーネントを形の上に出す。つなぐもののビューには今の形の様子だけを渡す。
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
import { bookItems, pagedOf } from "../../../core/book"
import type { Point } from "../../../core/geom"
import {
  type Edges,
  fitsPaper,
  itemSize,
  minSize,
  type PagedPage,
  resizedBy,
  shownRects,
} from "../../../core/place/items"
import { type PlacedShape, placedSize, rectsOf, shapesOf } from "../../../core/placed"
import type { Stage } from "../../../core/stage"
import { paperOf, placement, toPaperDelta } from "../../../core/stage"
import { toolOf } from "../../../core/workspace"
import { useCommand } from "../../../ui/commands"
import { type ShapeScene, useShapeMarks } from "../../../ui/connector"
import { useContextMenu } from "../../../ui/context-menu"
import { useT } from "../../../ui/i18n"
import type { BookViewProps, ItemViewProps } from "../../../ui/plugin"
import { useActions, useApp, useCatalog, useUiCatalog } from "../../../ui/store-context"
import { type Came, dragging, placeAt, trackDrag } from "../placing"
import styles from "./PaperView.module.css"

// 要素の左上から見たポインタの位置
const local = (e: PointerEvent<Element>, el: Element): Point => {
  const r = el.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

export function PaperView({ stage }: BookViewProps) {
  const openMenu = useContextMenu(stage.id, "paper.context")
  const place = useCommand(stage.id, "paper.place")
  const { select } = useActions()
  const ref = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const placing = stage.placing !== null
  const catalog = useCatalog().core
  const hand = useApp(s => toolOf(catalog, s.workspace, stage.id) === "hand")

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

// localOf はポインタの位置を、紙のビューの左上から見た位置にする
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
  swapped: boolean // このドラッグで入れ替えが起きたか（起きたら、動かす形の線は留まらずに一番よい形を追う）
}

// 大きさを変えているドラッグ: つかんだ辺と、押したときのポインタの位置
interface Stretch {
  pointer: number
  item: string
  edges: Edges
  start: Point
}

// 開いたページのアイテム（ページが無ければ何も描かない）
function Items({ stage, localOf }: { stage: Stage; localOf: LocalOf }) {
  const page = useApp(s => {
    const o = stage.opened
    const book = o ? pagedOf(s.books[o.book]) : undefined
    return book?.pages.find(pg => pg.id === o?.page)
  })
  return page ? <PageItems stage={stage} page={page} localOf={localOf} /> : null
}

// ページのアイテム。ドラッグ中は、動かすアイテムを動いた量だけずらして描く。つなぐもののビューの層で包む
function PageItems({ stage, page, localOf }: { stage: Stage; page: PagedPage; localOf: LocalOf }) {
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  // ブックで使えるつなぐもののビュー
  const connectors = useApp(s => {
    const b = stage.opened ? s.books[stage.opened.book] : undefined
    return b ? bookItems(catalog, b).join(" ") : ""
  })
    .split(" ")
    .flatMap(id => {
      const c = ui.connectors.get(id)
      return c ? [{ id, ...c }] : []
    })
  const move = useCommand(stage.id, "paper.move")
  const edit = useCommand(stage.id, "paper.edit")
  const openMenu = useContextMenu(stage.id, "item.context")
  const { select } = useActions()
  const drag = useRef<Drag | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  const resize = useCommand(stage.id, "paper.resize")
  const preview = useApp(s => s.dialog?.preview ?? null)
  const stretch = useRef<Stretch | null>(null)
  const [stretched, setStretched] = useState<Point>({ x: 0, y: 0 }) // 大きさを変えているドラッグの、画面の上で動いた量
  const hand = useApp(s => toolOf(catalog, s.workspace, stage.id) === "hand")
  const [hover, setHover] = useState<string | null>(null) // ポインタを乗せている形
  // 離したばかりの形（離したあとの 1 回の描画だけ、つなぐもののビューに渡す）
  const settled = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (settled.current.size > 0) settled.current = new Set()
  })

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
      swapped: false,
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    const screen = { x: e.clientX - d.start.x, y: e.clientY - d.start.y }
    const by = toPaperDelta(stage, screen)
    if (d.items.length === 1) {
      const id = d.items[0] as string
      d.came = trackDrag(catalog, page, id, d.prev, by, d.came)
      // 入れ替えが起きたら覚える（このドラッグの終わりまで）
      const now = rectsOf(catalog, page)
      const plan = dragging(catalog, page, id, by, d.came)
      if ([...(plan ?? [])].some(([k, r]) => k !== id && (r.x !== now.get(k)?.x || r.y !== now.get(k)?.y)))
        d.swapped = true
    }
    d.prev = by
    setMoved(screen)
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    drag.current = null
    setMoved(null)
    settled.current = new Set(d.items)
    if (drop && moved && (moved.x !== 0 || moved.y !== 0)) move.run({ items: d.items, by: moved, came: d.came })
  }
  const shift = moved && toPaperDelta(stage, moved)
  const d = drag.current
  const dragged = shift && d ? d.items : []
  const plan = shift && d?.items.length === 1 ? dragging(catalog, page, d.items[0] as string, shift, d.came) : null
  // ドラッグ中にずらして描く量（紙の上）
  const shiftOf = (item: PlacedShape): Point | null => {
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
  const shown = (placed: PlacedShape): PlacedShape => {
    const item =
      preview?.item !== undefined && preview.book === stage.opened?.book && preview.item === placed.id
        ? ({
            ...placed,
            props: { ...placed.props, ...preview.props },
            ...(preview.content ? { children: preview.content } : {}),
          } as PlacedShape)
        : placed
    const st = stretch.current
    if (!st || st.item !== item.id || !paper) return item
    const to = resizedBy(catalog, item, st.edges, toPaperDelta(stage, stretched), paper)
    return to ? { ...item, ...to } : item
  }
  const resizing = stretch.current && (stretched.x !== 0 || stretched.y !== 0) ? stretch.current.item : null
  const single = stage.selection.length === 1 && !hand && stage.placing === null
  // 描く形（下書き・大きさを変えている途中・ドラッグでずらした所を重ねたもの）
  const shapes = shapesOf(page).map(item => ({ item: shown(item), shift: shiftOf(item) }))
  const scene: ShapeScene = {
    stage,
    page,
    rects: shownRects(catalog, shapes),
    dragged,
    pushed: shapes.filter(({ item, shift }) => shift && !dragged.includes(item.id)).map(({ item }) => item.id),
    swapped: d?.swapped ?? false,
    settled: settled.current,
    busy: dragged.length > 0 || resizing !== null,
    selectable: !hand && stage.placing === null,
    hover,
    localOf,
  }

  const items = shapes.map(({ item, shift }) => (
    <Item
      key={item.id}
      stage={stage.id}
      item={item}
      onHover={on => setHover(h => (on ? item.id : h === item.id ? null : h))}
      overlays={connectors.flatMap(c => {
        const Overlay = c.overlay
        return Overlay ? [<Overlay key={c.id} scene={scene} id={item.id} />] : []
      })}
      stretchable={single && stage.selection[0] === item.id && minSize(catalog, item) !== null}
      onStretch={{
        down: (e, edges) => startStretch(e, item.id, edges),
        move: moveStretch,
        up: e => endStretch(e, true),
        cancel: e => endStretch(e, false),
      }}
      selected={stage.selection.includes(item.id)}
      shift={shift}
      dragged={dragged}
      resizing={resizing}
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
  return connectors.reduceRight<ReactNode>((inner, c) => {
    const Layer = c.layer
    return (
      <Layer key={c.id} scene={scene}>
        {inner}
      </Layer>
    )
  }, items)
}

interface ItemProps {
  stage: string
  item: PlacedShape
  onHover(on: boolean): void
  overlays: ReactNode // つなぐもののビューが形の上に重ねるコンポーネント
  stretchable: boolean // 四辺と四隅をつかんで大きさを変えられるか
  onStretch: {
    down(e: PointerEvent<HTMLDivElement>, edges: Edges): void
    move(e: PointerEvent<HTMLDivElement>): void
    up(e: PointerEvent<HTMLDivElement>): void
    cancel(e: PointerEvent<HTMLDivElement>): void
  }
  selected: boolean
  shift: Point | null // ドラッグ中にずらして描く量（紙の上）
  dragged: readonly string[] // ドラッグで動かしているアイテム
  resizing: string | null // 大きさを変えているアイテム
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
  onHover,
  overlays,
  stretchable,
  onStretch,
  selected,
  shift,
  dragged,
  resizing,
  ...handlers
}: ItemProps) {
  const catalog = useCatalog().core
  const marks = useShapeMarks()
  // ドラッグ中の見た目: つなぐもののビューが薄くするよう求めた形は薄く。動かすアイテムは透かし、大きさを変えているアイテムはそのまま、ほかは薄く
  const look = marks.keep
    ? marks.keep.has(item.id)
      ? undefined
      : "faded"
    : dragged.length > 0
      ? dragged.includes(item.id)
        ? "lifted"
        : "faded"
      : resizing && item.id !== resizing
        ? "faded"
        : undefined
  const ui = useUiCatalog().items.get(item.item)
  const size = placedSize(catalog, item)
  const View = ui?.view as ((p: ItemViewProps<PlacedShape["props"]>) => ReactNode) | undefined
  return (
    <div
      data-item={item.id}
      data-shape
      data-target={marks.target === item.id}
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
      {overlays}
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
  const catalog = useCatalog().core
  const at = placeAt({ stage }, pointer)
  const size = stage.placing ? itemSize(catalog, stage.placing) : null
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
