// スライドのレイヤー（スロット book-layers に置くウィジェット）: 紙の枠の中に、開いたページの slide のアイテムを重ねの順に描き、選ぶ・動かす・大きさを変える・回す・置く・文字の書き換えを受ける。
// ブックのタイプが slide を選んでいるブックだけで描く（選んでいなければ何も出さない）。ポインタを受けるのは、アイテムと選んだ物のつまみ・バーの上と、置こうとしている間の紙の上、
// 置けるアイテムが slide だけのタイプでは何も無い所も（選びを外す）。それ以外はステージ（と下のレイヤー）へ通す。
// アイテムは書いた位置と大きさ（紙の左上から。負でも、紙より大きくてもよい）に置き、角度（rotation）は枠の中心でかける。紙の外にはみ出た部分は切る（切るのはアイテムを描く所だけで、選んだ物のつまみは切らない）。
// 置こうとしている間は、紙の上でドラッグした四角（直線は線、自由な線はなぞった跡）に置く。押しただけなら、そのアイテムの置くときの大きさで押した所に置く。文字枠を置いたら、そのまま文字を打てる。
// アイテムを押すと選び、ドラッグで動かす。何も無い所からのドラッグ枠と、Shift・Ctrl・Commandを押しながらの押しで複数を選び、選んだ物は全体を囲む点線の枠で一緒に動かす（大きさ・回すつまみは 1 つを選んだときだけ）。右クリックでメニュー（@matomezu/slide:item-context）を開く。選んだアイテムは 8 つのつまみで大きさを変え（角は枠と文字を一緒に、辺は幅か高さだけ）、
// 右上の角の斜め外のつまみで回す（Shift で 15 度ずつ）。文字枠はダブルクリックで文字を書き換える（外を押すと決め、Escape でやめる）。
// ドラッグの途中の様子はビューに持ち、離したときに 1 回だけコマンドを呼ぶ（元に戻すのも 1 回）
import { type PointerEvent, useEffect, useRef, useState } from "react"
import {
  bookType,
  type ItemId,
  type PlacedShape,
  type Point,
  type Rect,
  type StageView,
  slideIsBackground,
  slideOf,
} from "../../../../plugin-api"
import {
  useActionsHere,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useShownBook,
  useShownPage,
  useStage,
  useToPaper,
} from "../../../../plugin-api/ui"
import { slideOffsetOf } from "../../../base"
import { PaperFrame, useFollowsSelection } from "../../../base/ui"
import { SLIDE_DELETE, SLIDE_MOVE_TO, SLIDE_PUT, SLIDE_RESHAPE, SLIDE_SET } from "../commands"
import {
  boundsOf,
  drawnRect,
  type Grip,
  movedPoint,
  pointsOnPaper,
  resizedRect,
  rotatedTo,
  scaledFontSize,
  snappedTo45,
  spanOf,
  thinned,
  touches,
  unionOf,
} from "../rect"
import { EllipseView } from "../SlideItemViews"
import { ADDED_EDIT, SLIDE_ITEM_CONTEXT, SLIDE_KEY_SCOPE } from "../scope"
import {
  DEFAULT_FONT_SIZE,
  ELLIPSE,
  FREE_LINE,
  linePointsOf,
  linePropsOf,
  MIN_SIZE,
  movedLineProps,
  STRAIGHT_LINE,
  TEXT_FRAME,
} from "../slide"
import { GRIPS, GroupSelection, type SelectedItem, Selection } from "./Selection"
import { rotationOf, SlideItem, shapeProps } from "./SlideItem"
import styles from "./SlideLayer.module.css"

// 押しただけとみなす動き（紙の上の px）と、自由な線の点の間引きの間
const CLICK = 4
const THIN = 3

const TEXT = TEXT_FRAME.id
const ROUND = ELLIPSE.id
const FREE = FREE_LINE.id
const LINE = STRAIGHT_LINE.id

type Drag =
  | {
      kind: "move"
      pointer: number
      items: readonly { id: string; rect: Rect }[]
      start: Point
      travelled: boolean
      click: string // 押したアイテム（複数を選んでいて、動かさずに離したら、これだけを選ぶ）
    }
  | { kind: "dragFrame"; pointer: number; start: Point; base: readonly string[] }
  | {
      kind: "point"
      pointer: number
      start: Point
      item: string
      index: number
      rect: Rect
      rotation: number
      points: readonly Point[] // 動かす前の点（枠の中の割合）
      min: number
    }
  | {
      kind: "grip"
      pointer: number
      item: string
      start: Point
      rect: Rect
      rotation: number
      grip: Grip
      min: number
      text: boolean
      round: boolean // 楕円（角を引くとき、Ctrl か Command で正円にできる）
    }
  | { kind: "rotate"; pointer: number; item: string; start: Point; center: Point; rotation: number; rect: Rect }
  | { kind: "draw"; pointer: number; item: ItemId; start: Point }

// ドラッグの途中の様子（離すまで、アクションは呼ばない）
interface Live {
  item: string
  rect: Rect
  rotation?: number
  scaled?: boolean
  points?: Point[] // 点を動かしている途中の線の点（枠の中の割合）
}

const rectOf = (shape: PlacedShape): Rect => ({ x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 })
// 始めの点 start から今の点 at への縦横を、長い方に揃えた終わりの点
function squaredEnd(start: Point, at: Point): Point {
  const side = Math.max(Math.abs(at.x - start.x), Math.abs(at.y - start.y))
  return { x: start.x + (at.x < start.x ? -side : side), y: start.y + (at.y < start.y ? -side : side) }
}
const round = (n: number): number => Math.round(n * 100) / 100
const roundRect = (f: Rect): Rect => ({ x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h) })

export function SlideLayer() {
  const stage = useStage()
  const catalog = useCoreCatalog()
  const type = stage?.opened?.type
  const slide = type ? bookType(catalog, type).slide : undefined
  if (!stage || !slide || stage.opened?.page == null) return null
  // slide がページの本体のタイプは、紙の何も無い所の押しも受ける（選びを外す）。背景のタイプは、背景編集モードの間だけ操作を受ける（ふだんは描くだけ）
  const body = !slideIsBackground(bookType(catalog, type as string))
  return <SlidePageView stage={stage} operable={body || stage.edits === "slide"} placeable={slide.allowed} />
}

function SlidePageView({
  stage,
  operable,
  placeable,
}: {
  stage: StageView
  operable: boolean // 操作を受けるか（本体のタイプはいつも。背景のタイプは背景編集モードの間だけ）
  placeable: readonly string[]
}) {
  const book = useShownBook()
  const page = useShownPage()
  const catalog = useCoreCatalog()
  const followed = useFollowsSelection(stage.id)
  const toPaperAt = useToPaper()
  const { select, setEditing, continueStep } = useActionsHere()
  const put = useCommand(SLIDE_PUT.id)
  const moveTo = useCommand(SLIDE_MOVE_TO.id)
  const reshape = useCommand(SLIDE_RESHAPE.id)
  const set = useCommand(SLIDE_SET.id)
  const remove = useCommand(SLIDE_DELETE.id)
  const openMenu = useContextMenu(SLIDE_ITEM_CONTEXT)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [drawn, setDrawn] = useState<Point[] | null>(null) // 置こうとしてなぞっている途中の点（紙の上）
  const [shift, setShift] = useState<{ ids: ReadonlySet<string>; by: Point } | null>(null) // 動かしている途中の、動かす物と動いた量
  const [dragFrame, setDragFrame] = useState<Rect | null>(null) // ドラッグ枠の途中の四角（紙の上）
  const typeNext = useRef(false) // 置いた文字枠で、そのまま文字を打つ
  const shapes = page ? slideOf(page) : []
  // 位置をデータに持たない見せ方（ツリー）が、可変ページで中身をずらした量。slide の形は、データの座標のまま、この分ずらして描く
  const offset = book && page ? slideOffsetOf(catalog, book, page) : { x: 0, y: 0 }
  const chosen = shapes.filter(s => stage.selection.includes(s.id)) // 選んでいるアイテム（重ねの順）
  const selected = chosen.length === 1 && stage.selection.length === 1 ? chosen[0] : undefined
  const placing =
    operable && stage.placing !== null && placeable.includes(stage.placing.item) ? stage.placing.item : null
  const editing = stage.editing === true || stage.editing === ADDED_EDIT ? (selected?.id ?? null) : null // 文字を書き換えているアイテム（選んでいる 1 つ）
  const minOf = (item: string): number => {
    const def = catalog.items.get(item)
    return def?.kind === "shape" && def.min ? Math.max(def.min.w, def.min.h) : MIN_SIZE
  }

  // 置いたばかりの文字枠が選ばれたら、そのまま文字を書く
  useEffect(() => {
    if (typeNext.current && selected && selected.item === TEXT) {
      typeNext.current = false
      setEditing(ADDED_EDIT)
    }
  }, [selected, stage.id, setEditing])

  const paperAt = (e: PointerEvent<Element>): Point | null => {
    const el = ref.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const at = toPaperAt({ x: e.clientX - r.left, y: e.clientY - r.top })
    return at && { x: at.x - offset.x, y: at.y - offset.y }
  }
  const finish = () => {
    drag.current = null
    setLive(null)
    setDrawn(null)
    setShift(null)
    setDragFrame(null)
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
      drag.current = {
        kind: "grip",
        pointer: e.pointerId,
        item: selected.id,
        start: at,
        rect,
        rotation: rotationOf(selected),
        grip: found?.grip ?? {},
        min: minOf(selected.item),
        text: selected.item === TEXT,
        round: selected.item === ROUND,
      }
      return
    }
    const pointEl = target.closest<HTMLElement>("[data-point]")
    if (pointEl && selected && !followed && reshape.enabled && set.enabled) {
      e.preventDefault()
      capture()
      drag.current = {
        kind: "point",
        pointer: e.pointerId,
        start: at,
        item: selected.id,
        index: Number(pointEl.dataset.point),
        rect: rectOf(selected),
        rotation: rotationOf(selected),
        points: linePointsOf(selected.item, shapeProps(selected)),
        min: minOf(selected.item),
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
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const itemEl = target.closest<HTMLElement>("[data-item]")
    const shape = itemEl && shapes.find(s => s.id === itemEl.dataset.item)
    if (shape && additive) {
      // Shift・Ctrl（Mac は Command）を押しながら押すと、選びに足す・外す
      select(
        stage.selection.includes(shape.id)
          ? stage.selection.filter(i => i !== shape.id)
          : [...stage.selection, shape.id],
      )
      return
    }
    // 選んだ物の全体の縁を押したら、選んだ物を一緒に動かす
    const edge = target.closest("[data-group-edge]") && chosen.length > 1
    const grabbed = shape ?? (edge ? chosen.at(-1) : undefined)
    if (grabbed) {
      const group = stage.selection.includes(grabbed.id) ? chosen : [grabbed]
      if (!stage.selection.includes(grabbed.id)) select([grabbed.id])
      if (followed || !moveTo.enabled) return
      capture()
      drag.current = {
        kind: "move",
        pointer: e.pointerId,
        items: group.map(s => ({ id: s.id, rect: rectOf(s) })),
        start: at,
        travelled: false,
        click: grabbed.id,
      }
      return
    }
    // 何も無い所からドラッグ枠（Shift・Ctrl を押していれば、今の選びに足す）
    if (!additive) select([])
    capture()
    drag.current = { kind: "dragFrame", pointer: e.pointerId, start: at, base: additive ? stage.selection : [] }
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
      setShift({ ids: new Set(d.items.map(i => i.id)), by })
    } else if (d.kind === "dragFrame") {
      setDragFrame(spanOf(d.start, at))
    } else if (d.kind === "point") {
      // Shift で、となりの点から 45 度ずつの向きに丸める
      const around = pointsOnPaper(d.rect, d.rotation, d.points)
      const neighbour = around[d.index === 0 ? 1 : d.index - 1]
      const to = e.shiftKey && neighbour ? snappedTo45(neighbour, at) : at
      const moved = movedPoint(d.rect, d.rotation, d.points, d.index, to, d.min)
      setLive({ item: d.item, rect: moved.rect, points: moved.points, rotation: 0 })
    } else if (d.kind === "grip") {
      const to = resizedRect(d.rect, d.rotation, d.grip, by, d.min, d.round && (e.ctrlKey || e.metaKey))
      setLive({ item: d.item, rect: to, scaled: to.scaled && d.text })
    } else if (d.kind === "rotate") {
      const rotation = rotatedTo(d.rotation, d.center, d.start, at, e.shiftKey ? 15 : undefined)
      setLive({ item: d.item, rect: d.rect, rotation })
    } else {
      // なぞる点は、自由な線ならすべて、それ以外は始めと今の 2 つ
      // 楕円は、Ctrl か Command を押していれば正円になるよう、縦横の長い方に揃える
      const end = d.item === ROUND && (e.ctrlKey || e.metaKey) ? squaredEnd(d.start, at) : at
      setDrawn(now => (d.item === FREE ? [...(now ?? [d.start]), at] : [d.start, end]))
    }
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    const l = live
    const points = drawn
    const moved = shift
    const swept = dragFrame
    finish()
    if (d.kind === "move") {
      if (d.travelled && moved) {
        // 動かす物を全部、1 つの画面の履歴の段で動かす
        moveTo.run({
          moves: d.items.map(i => ({
            item: i.id,
            at: { x: round(i.rect.x + moved.by.x), y: round(i.rect.y + moved.by.y) },
          })),
        })
      } else if (d.items.length > 1) select([d.click]) // 複数を選んでいて、動かさずに離したら、押した物だけを選ぶ
    } else if (d.kind === "dragFrame") {
      if (swept && Math.hypot(swept.w, swept.h) >= CLICK / stage.zoom) {
        const hit = shapes.filter(s => touches(boundsOf(rectOf(s), rotationOf(s)), swept)).map(s => s.id)
        select([...d.base, ...hit.filter(id => !d.base.includes(id))])
      }
    } else if (d.kind === "point" && l?.points) {
      const shape = shapes.find(s => s.id === d.item)
      if (shape) {
        // 点と枠は、同じ離した所で続けて変える（画面の履歴は 1 段）
        set.run({ items: [d.item], props: movedLineProps(shape.item, l.points) })
        reshape.run({ item: d.item, rect: roundRect(l.rect), scaled: false })
      }
    } else if (d.kind === "grip" && l) reshape.run({ item: d.item, rect: roundRect(l.rect), scaled: l.scaled === true })
    else if (d.kind === "rotate" && l && l.rotation !== undefined && l.rotation !== d.rotation)
      set.run({ items: [d.item], props: { rotation: l.rotation === 0 ? null : l.rotation } })
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
      const props = linePropsOf(item, fractions)
      put.run({ item, rect: roundRect(rect), props })
      return
    }
    const rect = moved
      ? drawnRect([from, to], minOf(item)).rect
      : { x: from.x, y: from.y, w: def.size.w, h: def.size.h }
    if (item === TEXT) typeNext.current = true
    put.run({ item, rect: roundRect(rect), props: item === TEXT ? { text: "" } : {} })
  }
  // アイテムを右クリックしたら、そのアイテムを選んで（選んだ物の 1 つなら選びはそのまま）メニューを開く
  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-item]")
    const shape = el && shapes.find(s => s.id === el.dataset.item)
    if (!shape || followed) return
    if (!stage.selection.includes(shape.id)) select([shape.id])
    openMenu(e, { item: shape.id })
  }
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 押したときにポインタを捕まえているので、イベントの対象はレイヤーになる。押した位置の一番上のアイテムを引く
    const el = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((n): n is HTMLElement => n instanceof HTMLElement && n.dataset.item !== undefined)
    const shape = el && shapes.find(s => s.id === el.dataset.item)
    if (shape?.item === TEXT && set.enabled && !followed) {
      select([shape.id])
      setEditing(true)
    }
  }

  // 描く形（ドラッグの途中のアイテムは、動かした先の枠・角度で。角のつまみなら文字の大きさも）
  const shown = shapes.map(s => {
    if (shift?.ids.has(s.id)) return { ...s, x: s.x + shift.by.x, y: s.y + shift.by.y } as PlacedShape
    if (!live || live.item !== s.id) return s
    const props = shapeProps(s)
    const scaledSize =
      live.scaled && s.item === TEXT && s.w
        ? { fontSize: scaledFontSize((props.fontSize as number | undefined) ?? DEFAULT_FONT_SIZE, live.rect.w, s.w) }
        : {}
    return {
      ...s,
      ...live.rect,
      props: {
        ...props,
        ...scaledSize,
        ...(live.rotation === undefined ? {} : { rotation: live.rotation }),
        ...(live.points ? movedLineProps(s.item, live.points) : {}),
      },
    } as PlacedShape
  })
  const current = selected && shown.find(s => s.id === selected.id)
  // 複数を選んでいるとき: 全体を囲む四角と、バーに渡す物
  const chosenShown = shown.filter(s => stage.selection.includes(s.id))
  const groupRect = chosenShown.length > 1 ? unionOf(chosenShown.map(s => boundsOf(rectOf(s), rotationOf(s)))) : null
  const group = groupRect && {
    rect: groupRect,
    subjects: chosenShown.map(s => ({ id: s.id, item: s.item, props: shapeProps(s) })),
  }
  const ghost = drawn && placing ? { item: placing, points: drawn } : null
  const item: SelectedItem | null = current
    ? {
        id: current.id,
        rect: rectOf(current),
        rotation: rotationOf(current),
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
      data-slide-layer
      data-key-scope={operable ? SLIDE_KEY_SCOPE.id : undefined}
      data-placing={placing !== null}
      data-active={operable}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <PaperFrame stage={stage} className={styles.paper} aria-hidden="true">
        <div className={styles.clip}>
          <div className={styles.shifted} style={{ left: offset.x, top: offset.y }}>
            {shown.map(shape => (
              <SlideItem
                key={shape.id}
                shape={shape}
                zoom={stage.zoom}
                edit={{
                  editing: editing === shape.id,
                  onCommit: (text, grown) => {
                    if (stage.editing === ADDED_EDIT && book) continueStep(book.id)
                    setEditing(false)
                    // 何も書かずに終えた文字枠は、何も言わずに消す（置いた直後なら、置いたことごと無かったことになる）
                    if (text === "") {
                      remove.run()
                      return
                    }
                    // 書いた文字と、文字に合わせて広げた枠は、1 つの画面の履歴の段にする
                    if (text !== (shapeProps(shape).text ?? "")) set.run({ items: [shape.id], props: { text } })
                    if (grown) reshape.run({ item: shape.id, rect: roundRect(grown), scaled: false })
                  },
                  onCancel: () => {
                    // やめても、文字が空のままの文字枠（置いた直後）は残さない
                    if (stage.editing === ADDED_EDIT && book) continueStep(book.id)
                    setEditing(false)
                    if ((shapeProps(shape).text ?? "") === "") remove.run()
                  },
                }}
              />
            ))}
            {ghost && <Ghost ghost={ghost} zoom={stage.zoom} />}
          </div>
        </div>
        <div className={styles.shifted} style={{ left: offset.x, top: offset.y }}>
          {operable && item && !placing && <Selection item={item} hidden={editing !== null} />}
          {operable && group && !placing && <GroupSelection rect={group.rect} subjects={group.subjects} />}
          {dragFrame && (
            <div
              className={styles.dragFrame}
              style={{ left: dragFrame.x, top: dragFrame.y, width: dragFrame.w, height: dragFrame.h }}
            />
          )}
        </div>
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
  if (item === ROUND) {
    // 置いたときと同じ見た目の楕円（EllipseView）
    return (
      <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
        <EllipseView
          id=""
          props={{}}
          content={{}}
          zoom={zoom}
          hasChildren={false}
          size={{ w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }}
        />
      </div>
    )
  }
  return (
    <svg className={styles.ghost} aria-hidden="true">
      <rect x={x} y={y} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} {...stroke} />
    </svg>
  )
}
