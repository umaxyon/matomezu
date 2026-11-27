// スライドのレイヤー（スロット book-layers に置くウィジェット）: 紙の枠の中に、開いたページの slide のアイテムを重ねの順に描き、選ぶ・動かす・大きさを変える・回す・置く・文字の書き換えを受ける。
// ページのタイプが slide を選んでいるブックだけで描く（選んでいなければ何も出さない）。ポインタを受けるのは、アイテムと選んだ物のつまみ・バーの上と、置こうとしている間の紙の上、
// 置けるアイテムが slide だけのタイプでは何も無い所も（選びを外す）。それ以外はステージ（と下のレイヤー）へ通す。
// アイテムは書いた位置と大きさ（紙の左上から。負でも、紙より大きくてもよい）に置き、角度（rotation）は枠の中心でかける。紙の外にはみ出た部分は切る（切るのはアイテムを描く所だけで、選んだ物のつまみは切らない）。
// 置こうとしている間は、紙の上でドラッグした四角（直線は線、自由な線はなぞった跡）に置く。押しただけなら、そのアイテムの置くときの大きさで押した所に置く。文字枠を置いたら、そのまま文字を打てる。
// 大きさが項目で決まる形（スクラップトレイから置くスクラップ）は、なぞらずに、押した所にその項目のまま置く。
// アイテムを押すと選び、ドラッグで動かす。何も無い所からのドラッグ枠と、Ctrl（Mac は Command）を押しながらの押しで複数を選び、選んだ物は全体を囲む点線の枠で一緒に動かす（大きさ・回すつまみは 1 つを選んだときだけ）。右クリックでメニュー（@matomezu/slide:item-context）を開く。選んだアイテムは 8 つのつまみで大きさを変え（角は枠と文字を一緒に、辺は幅か高さだけ）、
// 右上の角の斜め外のつまみで回す（Shift で 15 度ずつ。回せる形だけ）。比を保つ形（base の stretch が ratio。スクラップ）は角のつまみだけで、比を保って大きさを変える。文字枠はダブルクリックで文字を書き換える（外を押すと決め、Escape でやめる）。
// ドラッグの途中の様子はビューに持ち、離したときに 1 回だけコマンドを呼ぶ（元に戻すのも 1 回）
import { type PointerEvent, useEffect, useRef, useState } from "react"
import {
  areaOf,
  type ItemId,
  NO_PAGE,
  NO_PAPER,
  NO_PLACING,
  NO_PROPS,
  NO_STAGE,
  NOTHING_OPENED,
  openedPage,
  type Point,
  pageType,
  type Rect,
  type StageView,
  slideIsBackground,
  slideOf,
  within,
} from "../../../../plugin-api"
import {
  useActions,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useShownPage,
  useStage,
  useToPaper,
} from "../../../../plugin-api/ui"
import { NO_SIZE, PLACE_OFFSET, slideOffsetOf, stretchOf, writesSize } from "../../../base"
import {
  type FileDrop,
  modPressed,
  PaperFrame,
  useFileDrop,
  useFilePasteAt,
  useFollowsSelection,
} from "../../../base/ui"
import {
  SLIDE_DELETE,
  SLIDE_DROP,
  SLIDE_MOVE_TO,
  SLIDE_PASTE_FILES,
  SLIDE_PUT,
  SLIDE_RESHAPE,
  SLIDE_SET,
} from "../commands"
import {
  CLICK,
  drawnPlacement,
  groupOf,
  type Live,
  minSizeOf,
  movesBy,
  selectedItemOf,
  shownShapes,
  sizedShapes,
  stampSize,
  sweptSelection,
} from "../layer"
import {
  type Grip,
  movedPoint,
  pointsOnPaper,
  rectOf,
  resizedRect,
  rotatedTo,
  rotationOf,
  roundRect,
  shapeProps,
  snappedTo45,
  spanOf,
  squaredEnd,
} from "../rect"
import { ADDED_EDIT, SLIDE_ITEM_CONTEXT, SLIDE_KEY_SCOPE, TEXT_EDIT } from "../scope"
import { FREE_LINE, linePointsOf, movedLineProps, STRAIGHT_LINE, squarable, TEXT_FRAME } from "../slide"
import { useSlideItemView } from "./item-view"
import { GRIPS, GroupSelection, type SelectedItem, Selection } from "./Selection"
import { SlideItem } from "./SlideItem"
import styles from "./SlideLayer.module.css"

const TEXT = TEXT_FRAME.id
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
      keep: "ratio" | "square" | "free" // 角を引くとき: ratio は比を保つ形（スクラップ）、square は楕円・長方形（Ctrl か Command で縦横をそろえられる）
    }
  | { kind: "rotate"; pointer: number; item: string; start: Point; center: Point; rotation: number; rect: Rect }
  | { kind: "draw"; pointer: number; item: ItemId; start: Point }

export function SlideLayer() {
  const stage = useStage()
  const catalog = useCoreCatalog()
  const opened = openedPage(stage === NO_STAGE ? NOTHING_OPENED : stage.opened)
  const slide = opened === NO_PAGE ? undefined : pageType(catalog, opened.type).slide
  if (stage === NO_STAGE || opened === NO_PAGE || !slide) return null
  // slide がページの本体のタイプは、紙の何も無い所の押しも受ける（選びを外す）。背景のタイプは、背景編集モードの間だけ操作を受ける（ふだんは描くだけ）
  const body = !slideIsBackground(pageType(catalog, opened.type))
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
  const page = useShownPage()
  const catalog = useCoreCatalog()
  const followed = useFollowsSelection()
  const toPaperAt = useToPaper()
  const { select, setEditing, continueStep } = useActions()
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
  const [hover, setHover] = useState<Point | null>(null) // 押して置く形を置こうとしている間の、押すと置く左上（紙の上）
  const [shift, setShift] = useState<{ ids: ReadonlySet<string>; by: Point } | null>(null) // 動かしている途中の、動かす物と動いた量
  const [dragFrame, setDragFrame] = useState<Rect | null>(null) // ドラッグ枠の途中の四角（紙の上）
  const typeNext = useRef(false) // 置いた文字枠で、そのまま文字を打つ
  const shapes = page === NO_PAGE ? [] : sizedShapes(catalog, slideOf(page))
  // 位置をデータに持たないプレゼンテーション（ツリー）が、可変ページで中身をずらした量。slide の形は、データの座標のまま、この分ずらして描く
  const offset = page === NO_PAGE ? { x: 0, y: 0 } : slideOffsetOf(catalog, page)
  const chosen = shapes.filter(s => stage.selection.includes(s.id)) // 選んでいるアイテム（重ねの順）
  const selected = chosen.length === 1 && stage.selection.length === 1 ? chosen[0] : undefined
  const placing =
    operable && stage.placing !== NO_PLACING && placeable.includes(stage.placing.item) ? stage.placing.item : null
  const editing = stage.editing === TEXT_EDIT || stage.editing === ADDED_EDIT ? (selected?.id ?? null) : null // 文字を書き換えているアイテム（選んでいる 1 つ）
  const minOf = (item: string): number => minSizeOf(catalog, item)
  // 置こうとしている形が、なぞらずに押した所に置く形（大きさが項目で決まる形）か。その間は紙と同じく、置く大きさの点線の箱を出し、ポインタは足す印
  const stamp = placing !== null && writesSize(catalog, placing)
  const placingProps =
    stage.placing !== NO_PLACING && stage.placing.props !== NO_PROPS ? stage.placing.props : undefined

  // 置いたばかりの文字枠が選ばれたら、そのまま文字を書く
  useEffect(() => {
    if (typeNext.current && selected && selected.item === TEXT) {
      typeNext.current = false
      setEditing(ADDED_EDIT)
    }
  }, [selected, setEditing])

  // ポインタの所（back は、そこから左上へ離す画面の px）の、紙の上の点
  const paperAt = (e: { clientX: number; clientY: number }, back: Point = { x: 0, y: 0 }): Point | null => {
    const el = ref.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const at = toPaperAt({ x: e.clientX - r.left - back.x, y: e.clientY - r.top - back.y })
    return at === NO_PAPER ? null : { x: at.x - offset.x, y: at.y - offset.y }
  }
  // 外から落としたファイルのスクラップを、左上が落とした所に来るよう置く
  const drop = useCommand(SLIDE_DROP.id)
  const placeFile = (d: FileDrop) =>
    drop.run({ page: d.page, item: d.item as ItemId, props: d.props, at: d.at, shift: d.shift })
  const files = useFileDrop(e => paperAt(e) ?? NO_PAPER, placeFile)
  // Ctrl+V で貼ったファイルも、最後にポインタが在った所に置く（紙の上でなければ、スライドの左上に）
  useFilePasteAt(
    SLIDE_PASTE_FILES.id,
    p => {
      const at = paperAt(p)
      const area = areaOf(stage)
      if (!at || area === NO_PAPER) return NO_PAPER
      return within({ x: at.x + offset.x, y: at.y + offset.y }, area) ? at : NO_PAPER
    },
    placeFile,
  )
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
      // 大きさが項目で決まる形は、紙と同じく、ポインタから PLACE_OFFSET だけ左上を左上にして置く
      const start = stamp ? (paperAt(e, PLACE_OFFSET) ?? at) : at
      drag.current = { kind: "draw", pointer: e.pointerId, item: placing, start }
      setDrawn([start])
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
        keep: stretchOf(catalog, selected.item) === "ratio" ? "ratio" : squarable(selected.item) ? "square" : "free",
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
    const additive = modPressed(e)
    const itemEl = target.closest<HTMLElement>("[data-item]")
    const shape = itemEl && shapes.find(s => s.id === itemEl.dataset.item)
    if (shape && additive) {
      // Ctrl（Mac は Command）を押しながら押すと、選びに足す・外す（図のページの選び方と同じ。base の modPressed）
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
    // 何も無い所からドラッグ枠（Ctrl〈Mac は Command〉を押していれば、今の選びに足す）
    if (!additive) select([])
    capture()
    drag.current = { kind: "dragFrame", pointer: e.pointerId, start: at, base: additive ? stage.selection : [] }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (stamp && !drag.current) setHover(paperAt(e, PLACE_OFFSET))
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
      const keep = d.keep === "square" && !(e.ctrlKey || e.metaKey) ? "free" : d.keep
      const to = resizedRect(d.rect, d.rotation, d.grip, by, d.min, keep)
      setLive({ item: d.item, rect: to, scaled: to.scaled && d.text })
    } else if (d.kind === "rotate") {
      const rotation = rotatedTo(d.rotation, d.center, d.start, at, e.shiftKey ? 15 : undefined)
      setLive({ item: d.item, rect: d.rect, rotation })
    } else {
      // なぞる点は、自由な線ならすべて、それ以外は始めと今の 2 つ
      // 楕円・長方形は、Ctrl か Command を押していれば正円・正方形になるよう、縦横の長い方に揃える
      const end = squarable(d.item) && (e.ctrlKey || e.metaKey) ? squaredEnd(d.start, at) : at
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
        moveTo.run({ moves: movesBy(d.items, moved.by) })
      } else if (d.items.length > 1) select([d.click]) // 複数を選んでいて、動かさずに離したら、押した物だけを選ぶ
    } else if (d.kind === "dragFrame") {
      if (swept && Math.hypot(swept.w, swept.h) >= CLICK / stage.zoom) {
        select(sweptSelection(shapes, d.base, swept))
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
    const placed = drawnPlacement(catalog, item, points, stage.zoom, placingProps)
    if (!placed) return
    if (item === TEXT) typeNext.current = true
    put.run({ item, ...placed })
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
      setEditing(TEXT_EDIT)
    }
  }

  // 描く形（ドラッグの途中のアイテムは、動かした先の枠・角度で。角のつまみなら文字の大きさも）
  const shown = shownShapes(shapes, shift, live)
  const current = selected && shown.find(s => s.id === selected.id)
  // 複数を選んでいるとき: 全体を囲む四角と、バーに渡す物
  const group = groupOf(shown, stage.selection)
  // なぞる途中の見え方（大きさが項目で決まる形は、なぞらずに押した所に置くので出さない）
  const ghost = drawn && placing && !writesSize(catalog, placing) ? { item: placing, points: drawn } : null
  const item: SelectedItem | null = selectedItemOf(catalog, current)
  const stamped = stamp && hover && placing ? stampSize(catalog, placing, placingProps ?? {}) : NO_SIZE
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 選ぶ・動かす・大きさを変える・回すのはポインタの操作で、キーの操作はコマンドとキーバインドが受ける
    <div
      ref={ref}
      className={styles.layer}
      tabIndex={-1}
      data-slide-layer
      data-key-scope={operable ? SLIDE_KEY_SCOPE.id : undefined}
      data-placing={placing !== null}
      data-stamp={stamp}
      data-active={operable}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onPointerLeave={() => setHover(null)}
      onDragOver={operable ? files.onDragOver : undefined}
      onDrop={operable ? files.onDrop : undefined}
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
                    if (stage.editing === ADDED_EDIT && stage.opened !== NOTHING_OPENED)
                      continueStep(stage.opened.outermost.id)
                    setEditing("none")
                    // 何も書かずに終えた文字枠は、何も言わずに消す（置いた直後なら、置いたことごと無かったことになる）
                    if (text === "") {
                      remove.run()
                      return
                    }
                    // 書いた文字と、文字に合わせて広げた枠は、1 つの画面の履歴の段にする
                    if (text !== (shapeProps(shape).text ?? "")) set.run({ items: [shape.id], props: { text } })
                    if (grown) reshape.run({ item: shape.id, rect: roundRect(grown), scaled: false })
                  },
                }}
              />
            ))}
            {ghost && <Ghost ghost={ghost} zoom={stage.zoom} />}
            {hover && stamped !== NO_SIZE && (
              <div
                className={styles.stamp}
                style={{ left: hover.x, top: hover.y, width: stamped.w, height: stamped.h }}
                data-ghost
              />
            )}
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

// なぞっている途中の見え方: 文字枠は点線の四角、直線は線、自由な線はなぞった跡、ほかは置いたときと同じ見た目
function Ghost({ ghost, zoom }: { ghost: { item: ItemId; points: readonly Point[] }; zoom: number }) {
  const { item, points } = ghost
  const { View, tokens } = useSlideItemView(item)
  const a = points[0]
  const b = points.at(-1)
  if (!a || !b || points.length < 2) return null
  const stroke = { stroke: "var(--skin-accent)", strokeWidth: 2 / zoom, fill: "none", strokeDasharray: `${6 / zoom}` }
  if (item === FREE || item === LINE) {
    const at = item === FREE ? points : [a, b]
    return (
      <svg className={styles.ghost} aria-hidden="true" data-ghost>
        <polyline points={at.map(p => `${p.x},${p.y}`).join(" ")} {...stroke} />
      </svg>
    )
  }
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  if (item !== TEXT && View) {
    // その種類のビュー（項目は既定のまま）。線の色はプラグインのテーマキーなので、その範囲 tokens の中に描く
    return (
      <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none", ...tokens }} data-ghost>
        <View
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
    <svg className={styles.ghost} aria-hidden="true" data-ghost>
      <rect x={x} y={y} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} {...stroke} />
    </svg>
  )
}
