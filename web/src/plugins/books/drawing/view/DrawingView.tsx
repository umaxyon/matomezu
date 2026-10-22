// 図面のブックのビュー: ステージの紙の置き場所（core/stage.ts の placement）に紙を描き、その上に開いたページのアイテムを置く。
// ページが無ければ、真ん中にページを作るボタン（コマンド page.new）を出す。表に無い紙は代わりの紙に「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、図面のメニュー（drawing.context）を開く。
// アイテムを置こうとしている間は、ポインタに点線の箱が付いてきて、押すとそこに置く（drawing.place。紙からはみ出す所では薄く出し、置かない）。
// 選択の道具では、アイテムを押すと選び、ドラッグで動かす（離したときに drawing.move）。ダブルクリックで中身を編集する（drawing.edit）。何も無い所を押すと選択を外す。
// アイテムを右クリックすると、そのアイテムを選んで（選んでいたなら選択はそのまま）アイテムのメニュー（box.context）を開く。
// アイテムを 1 つだけ選んでいて、そのアイテムの幅を変えられるなら、左右の辺と四隅をつかんで幅を変えられる（印は出さず、ポインタの形だけが変わる。
// 角は近い辺と同じに動く。離したときに drawing.resize）。
// ドラッグの途中の動いた量と、点線の箱のポインタの位置だけはビューに持つ
import { type MouseEvent, type PointerEvent, type ReactNode, useRef, useState } from "react"
import type { Point } from "../../../../core/geom"
import type { BookOf } from "../../../../core/schema/book"
import type { Stage } from "../../../../core/stage"
import { paperOf, placement, toPaperDelta } from "../../../../core/stage"
import { toolOf } from "../../../../core/workspace"
import { useCommand } from "../../../../ui/commands"
import { useContextMenu } from "../../../../ui/context-menu"
import { useT } from "../../../../ui/i18n"
import type { BookViewProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry, useUi } from "../../../../ui/store-context"
import { fitsPaper, itemSize, itemsOf, minWidth, type Placed, placeAt, placedSize, resizedBy } from "../items"
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
      <Content stage={stage} pointer={placing ? pointer : null} />
    </div>
  )
}

function Content({ stage, pointer }: { stage: Stage; pointer: Point | null }) {
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
      style={{ width: p.w, height: p.h, transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})` }}
    >
      {paper?.status === "unknown" && <span className={styles.unknown}>{t("Unknown paper")}</span>}
      <Items stage={stage} />
      {pointer && <Ghost stage={stage} pointer={pointer} />}
    </div>
  )
}

// ドラッグ中のポインタと、押した位置・動かすアイテム
interface Drag {
  pointer: number
  start: Point
  items: readonly string[]
}

type Side = "left" | "right"

// 幅を変えているドラッグ: つかんだ辺と、押したときのポインタの横の位置
interface Stretch {
  pointer: number
  item: string
  side: Side
  startX: number
}

// 開いたページのアイテム。ドラッグ中は、動かすアイテムを動いた量だけずらして描く
function Items({ stage }: { stage: Stage }) {
  const page = useApp(s => {
    const o = stage.opened
    const book = o ? (s.books[o.book] as BookOf<"drawing"> | undefined) : undefined
    return book?.pages.find(pg => pg.id === o?.page)
  })
  const move = useCommand(stage.id, "drawing.move")
  const edit = useCommand(stage.id, "drawing.edit")
  const openMenu = useContextMenu(stage.id, "box.context")
  const { select } = useActions()
  const drag = useRef<Drag | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  const resize = useCommand(stage.id, "drawing.resize")
  const stretch = useRef<Stretch | null>(null)
  const [stretched, setStretched] = useState(0) // 幅を変えているドラッグの、画面の上で横に動いた量
  const registry = useRegistry()
  const hand = useApp(s => toolOf(registry, s.workspace, stage.id) === "hand")
  if (!page) return null

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0 || hand || stage.placing !== null) return
    const items = stage.selection.includes(id) ? stage.selection : [id]
    select(stage.id, items)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, items }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer === e.pointerId) setMoved({ x: e.clientX - d.start.x, y: e.clientY - d.start.y })
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    drag.current = null
    setMoved(null)
    if (drop && moved && (moved.x !== 0 || moved.y !== 0)) move.run({ items: d.items, by: moved })
  }
  const shift = moved && toPaperDelta(stage, moved)

  const startStretch = (e: PointerEvent<HTMLDivElement>, item: string, side: Side) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    stretch.current = { pointer: e.pointerId, item, side, startX: e.clientX }
  }
  const moveStretch = (e: PointerEvent<HTMLDivElement>) => {
    const st = stretch.current
    if (st?.pointer === e.pointerId) setStretched(e.clientX - st.startX)
  }
  const endStretch = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const st = stretch.current
    if (st?.pointer !== e.pointerId) return
    stretch.current = null
    setStretched(0)
    if (drop && stretched !== 0) resize.run({ item: st.item, side: st.side, by: stretched })
  }
  const paper = paperOf(stage)
  // 幅を変えている途中のアイテムは、変えたあとの左端と幅で描く
  const shown = (item: Placed): Placed => {
    const st = stretch.current
    if (!st || st.item !== item.id || !paper) return item
    const to = resizedBy(registry, item, st.side, toPaperDelta(stage, { x: stretched, y: 0 }).x, paper)
    return to ? { ...item, ...to } : item
  }
  const single = stage.selection.length === 1 && !hand && stage.placing === null

  return itemsOf(page).map(item => (
    <Item
      key={item.id}
      item={shown(item)}
      stretchable={single && stage.selection[0] === item.id && minWidth(item) !== null}
      onStretch={{
        down: (e, side) => startStretch(e, item.id, side),
        move: moveStretch,
        up: e => endStretch(e, true),
        cancel: e => endStretch(e, false),
      }}
      selected={stage.selection.includes(item.id)}
      shift={shift && drag.current?.items.includes(item.id) ? shift : null}
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
}

interface ItemProps {
  item: Placed
  stretchable: boolean // 辺と四隅をつかんで幅を変えられるか
  onStretch: {
    down(e: PointerEvent<HTMLDivElement>, side: Side): void
    move(e: PointerEvent<HTMLDivElement>): void
    up(e: PointerEvent<HTMLDivElement>): void
    cancel(e: PointerEvent<HTMLDivElement>): void
  }
  selected: boolean
  shift: Point | null // ドラッグ中にずらして描く量（紙の上）
  onPointerDown(e: PointerEvent<HTMLDivElement>): void
  onPointerMove(e: PointerEvent<HTMLDivElement>): void
  onPointerUp(e: PointerEvent<HTMLDivElement>): void
  onPointerCancel(e: PointerEvent<HTMLDivElement>): void
  onDoubleClick(): void
  onContextMenu(e: MouseEvent<HTMLDivElement>): void
}

// 幅を変えるためにつかめる所: 左右の辺と四隅（角は近い辺と同じに動く）
const GRIPS: readonly { at: string; side: Side }[] = [
  { at: "left", side: "left" },
  { at: "right", side: "right" },
  { at: "top-left", side: "left" },
  { at: "bottom-left", side: "left" },
  { at: "top-right", side: "right" },
  { at: "bottom-right", side: "right" },
]

// 置いたアイテム 1 つ。結んだビューで描き、ビューの無いアイテムは枠だけを描く
function Item({ item, stretchable, onStretch, selected, shift, ...handlers }: ItemProps) {
  const registry = useRegistry()
  const ui = useUi().items.get(item.item)
  const size = placedSize(registry, item)
  const View = ui?.view as ((p: { props: Placed["props"]; w: number }) => ReactNode) | undefined
  return (
    <div
      data-item={item.id}
      className={styles.item}
      data-selected={selected}
      style={{
        left: item.x,
        top: item.y,
        width: size?.w,
        height: size?.h,
        transform: shift ? `translate(${shift.x}px, ${shift.y}px)` : undefined,
      }}
      {...handlers}
    >
      {View && size ? <View props={item.props} w={size.w} /> : <div className={styles.unknownItem} />}
      {stretchable &&
        GRIPS.map(g => (
          <div
            key={g.at}
            className={styles.grip}
            data-grip={g.at}
            onPointerDown={e => onStretch.down(e, g.side)}
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
