// 図面のブックのビュー: ステージの紙の置き場所（core/stage.ts の placement）に紙を描き、その上に開いたページのアイテムを置く。
// ページが無ければ、真ん中にページを作るボタン（コマンド page.new）を出す。表に無い紙は代わりの紙に「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、図面のメニュー（drawing.context）を開く。
// アイテムを置こうとしている間は、ポインタに点線の箱が付いてきて、押すとそこに置く（drawing.place。紙からはみ出す所では薄く出し、置かない）。Escape で取り消す。
// 選択の道具では、アイテムを押すと選び、ドラッグで動かす（離したときに drawing.move）。何も無い所を押すと選択を外す。
// ドラッグの途中の動いた量と、点線の箱のポインタの位置だけはビューに持つ
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react"
import type { Point } from "../../../../core/geom"
import type { BookOf } from "../../../../core/schema/book"
import type { Stage } from "../../../../core/stage"
import { paperOf, placement, toPaperDelta } from "../../../../core/stage"
import { useCommand } from "../../../../ui/commands"
import { useContextMenu } from "../../../../ui/context-menu"
import { useT } from "../../../../ui/i18n"
import type { BookViewProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry, useUi } from "../../../../ui/store-context"
import { fitsPaper, itemSize, itemsOf, type Placed, placeAt } from "../items"
import styles from "./DrawingView.module.css"

// 要素の左上から見たポインタの位置
const local = (e: PointerEvent<Element>, el: Element): Point => {
  const r = el.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

export function DrawingView({ stage }: BookViewProps) {
  const openMenu = useContextMenu(stage.id, "drawing.context")
  const place = useCommand(stage.id, "drawing.place")
  const { select, stopPlacing } = useActions()
  const ref = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const placing = stage.placing !== null

  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopPlacing(stage.id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [placing, stage.id, stopPlacing])

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (placing && ref.current) setPointer(local(e, ref.current))
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ref.current) return
    if (placing) {
      e.preventDefault() // 置いて開いたダイアログから、押した続きで焦点を移さない
      place.run(local(e, ref.current))
    } else if (stage.tool !== "hand" && !(e.target as Element).closest("[data-item]")) select(stage.id, [])
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

// 開いたページのアイテム。ドラッグ中は、動かすアイテムを動いた量だけずらして描く
function Items({ stage }: { stage: Stage }) {
  const page = useApp(s => {
    const o = stage.opened
    const book = o ? (s.books[o.book] as BookOf<"drawing"> | undefined) : undefined
    return book?.pages.find(pg => pg.id === o?.page)
  })
  const move = useCommand(stage.id, "drawing.move")
  const { select } = useActions()
  const drag = useRef<Drag | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  if (!page) return null

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0 || stage.tool === "hand" || stage.placing !== null) return
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

  return itemsOf(page).map(item => (
    <Item
      key={item.id}
      item={item}
      selected={stage.selection.includes(item.id)}
      shift={shift && drag.current?.items.includes(item.id) ? shift : null}
      onPointerDown={e => onPointerDown(e, item.id)}
      onPointerMove={onPointerMove}
      onPointerUp={e => endDrag(e, true)}
      onPointerCancel={e => endDrag(e, false)}
    />
  ))
}

interface ItemProps {
  item: Placed
  selected: boolean
  shift: Point | null // ドラッグ中にずらして描く量（紙の上）
  onPointerDown(e: PointerEvent<HTMLDivElement>): void
  onPointerMove(e: PointerEvent<HTMLDivElement>): void
  onPointerUp(e: PointerEvent<HTMLDivElement>): void
  onPointerCancel(e: PointerEvent<HTMLDivElement>): void
}

// 置いたアイテム 1 つ。結んだビューで描き、ビューの無いアイテムは枠だけを描く
function Item({ item, selected, shift, ...handlers }: ItemProps) {
  const registry = useRegistry()
  const ui = useUi().items.get(item.item)
  const size = itemSize(registry, item.item)
  const View = ui?.view as ((p: { props: Placed["props"] }) => ReactNode) | undefined
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
      {View ? <View props={item.props} /> : <div className={styles.unknownItem} />}
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
