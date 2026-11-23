// 紙のビュー（プレゼンテーション paper）: プレゼンテーションのビューのレイヤー（book-content）が描く。紙の枠（PaperFrame。紙の面は下のレイヤーが描く）の中に、開いたページのアイテムを置く。
// 表に無い紙は代わりの紙に「不明な紙」と示す。
// 画面のどこを右クリックしても、紙のメニュー（paper-context）を開く。
// アイテムを置こうとしている間は、ポインタに点線の箱が付いてきて、押すと置く（paper-place。紙からはみ出す所では薄く出し、置かない）。
// ポインタが子を持てる形の上なら、その中へ入る（入る先の形を、付け替えの道具の落とす先と同じに示す。placing/items.ts の placeTarget）。
// 選択の道具で何も無い所からドラッグすると、四角にかかったページの形と、両端がその形の線を選ぶ（Mod なら選択に足す。placing/selection.ts の sweptItems）。
// 選択の道具では、アイテムを押すと選び、Mod を押していれば選択に足す・外す（外すのは動かさずに離したとき。placing/selection.ts の pressSelection）。選んでいる物の 1 つを押して動かさずに離すと、その 1 つに選び直す。
// ドラッグで選んでいる形を動かす（離したときに paper-move。つなぐものは動かさず、親の違う形が混じっていれば動かさない）。ドラッグ中は、動かすアイテムを少し透かしてポインタに付け、
// ほかのアイテムは薄くして動かさない。アイテム 1 つなら、通り道（items.ts の trackDrag）を覚え、正面から半分入った相手をその場で入れ替えて描く（dragging）。ダブルクリックで、その 1 つを選んで中身を編集する（paper-edit）。何も無い所を押すと選択を外す。
// アイテムを右クリックすると、そのアイテムを選んで（選んでいたなら選択はそのまま）アイテムのメニュー（item-context）を開く。
// アイテムを 1 つだけ選んでいて、そのアイテムの大きさを変えられるなら、四辺と四隅をつかんで大きさを変えられる（印は出さず、ポインタの形だけが変わる。
// 辺はその辺だけ、角は 2 つの辺を動かす。離したときに paper-resize。つかんで動かしている間は、ほかのアイテムを薄くする）。
// 編集のダイアログで選んだ値（下書き）は、決める前から箱に重ねて描く。下書きを重ねた形は、形の整え（settle）を通して描く（placing/draft.ts。子を動かす整えも、決める前から見える）。
// ブックで使えるつなぐもの（線など）は、そのビュー（ui/connector.ts）で形の並びを包み、形ごとに重ねるコンポーネントを形の上に出す。つなぐもののビューには今の形の様子だけを渡す。
// ドラッグの途中の動いた量と、点線の箱のポインタの位置だけはビューに持つ。
// 紙をずらしても、ずらすのは紙の枠だけで、アイテムは描き直さない（紙をずらす量を読むのは紙の枠と点線の箱だけ）

import { memo, type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  allowedItems,
  areaOf,
  findShape,
  type ItemPage,
  NO_PAGE,
  NO_PAPER,
  NO_PLACING,
  NO_STAGE,
  type PlacedShape,
  type Point,
  type Rect,
  type StageView,
  shapesOf,
  toPaperDelta,
} from "../../../plugin-api"
import {
  NO_AREA,
  type ShapeScene,
  TokenScope,
  useActions,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  usePage,
  usePageById,
  useShownPage,
  useStage,
  useStageArea,
  useToPaper,
  useUiCatalog,
} from "../../../plugin-api/ui"
import { type Edges, followConnectors, growOf, minSize, onlySelected, roomOf, shownRects } from "../../base"
import { modPressed, PaperFrame, useFollowsSelection } from "../../base/ui"
import { kit } from "../kit"
import { ITEM_CONTEXT, PAPER_CONTEXT } from "../paper"
import {
  type Came,
  dragging,
  dropTarget,
  lifted,
  movableTogether,
  PAPER_EDIT,
  PAPER_MOVE,
  PAPER_PLACE,
  PAPER_REPARENT,
  PAPER_RESIZE,
  pressSelection,
  shapesIn,
  sweptBox,
  sweptItems,
  sweptSelection,
  trackDrag,
} from "../placing"
import { settledDraft } from "../placing/draft"
import { shiftedBy, shownShape, slidShapes } from "../placing/shown"
import { REPARENT_TOOL } from "../tools"
import { Item } from "./PaperItem"
import styles from "./PaperView.module.css"
import { type Placing, usePlaceTarget } from "./use-place-target"

// 範囲のドラッグ: ポインタと、押した位置（紙のビューの左上から）、押す前の選択と、Mod を押していたか
interface Sweep {
  pointer: number
  start: Point
  base: readonly string[]
  mod: boolean
}

// 範囲のドラッグを始めるまでに動かす量（画面の px）
const SWEEP_START = 3

// 要素の左上から見たポインタの位置
const local = (e: PointerEvent<Element>, el: Element): Point => {
  const r = el.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

export function PaperView() {
  const stage = useStage()
  const openMenu = useContextMenu(PAPER_CONTEXT)
  const place = useCommand(PAPER_PLACE.id)
  const { select } = useActions()
  const ref = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const placing = stage !== NO_STAGE && stage.placing !== NO_PLACING
  const pans = stage !== NO_STAGE && stage.pans
  const localOf = useCallback((e: PointerEvent<Element>) => ref.current && local(e, ref.current), [])
  const catalog = useCoreCatalog()
  const shownPage = usePage()
  const page = shownPage === NO_PAGE ? undefined : shownPage
  const toPaperAt = useToPaper()
  const sweep = useRef<Sweep | null>(null)
  const followed = useFollowsSelection()
  const placed = usePlaceTarget(placing ? pointer : null) // 置こうとしている間の、押すと置く所
  const [box, setBox] = useState<Rect | null>(null) // 範囲のドラッグの四角（紙の上）

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (placing && ref.current) setPointer(local(e, ref.current))
    const sw = sweep.current
    if (sw?.pointer !== e.pointerId || !ref.current || !page) return
    // つかむ前に外で離していたら終える
    if (e.buttons === 0) {
      endSweep(e)
      return
    }
    const at = local(e, ref.current)
    if (!box && Math.hypot(at.x - sw.start.x, at.y - sw.start.y) < SWEEP_START) return
    // ポインタをつかむのは範囲のドラッグになってから（押しただけなら、紙の上のボタンなどへのクリックはそのまま届く）
    if (!box) e.currentTarget.setPointerCapture(e.pointerId)
    const a = toPaperAt(sw.start)
    const b = toPaperAt(at)
    if (a === NO_PAPER || b === NO_PAPER) return
    const r = sweptBox(a, b)
    setBox(r)
    select(sweptSelection(sw.base, sweptItems(catalog, page, r), sw.mod))
  }
  const endSweep = (e: PointerEvent<HTMLDivElement>) => {
    if (sweep.current?.pointer !== e.pointerId) return
    sweep.current = null
    setBox(null)
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ref.current) return
    if (placing) {
      e.preventDefault() // 置いて開いたダイアログから、押した続きで焦点を移さない
      place.run(local(e, ref.current))
      return
    }
    if (pans || (e.target as Element).closest("[data-item]")) return
    // 何も無い所を押すと選択を外す（Mod なら選択はそのまま）。選択の道具なら、そこから範囲のドラッグを始める
    const mod = modPressed(e)
    if (!mod) select([])
    if (stage === NO_STAGE || stage.tool !== "@matomezu/base:select") return
    sweep.current = {
      pointer: e.pointerId,
      start: local(e, ref.current),
      base: !mod ? [] : followed || !page ? stage.selection : lifted(page, stage.selection),
      mod,
    }
  }
  if (stage === NO_STAGE) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 押した所に置く・選択を外すのはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div
      ref={ref}
      className={styles.drawing}
      data-placing={placing}
      onContextMenu={e => {
        const r = ref.current?.getBoundingClientRect()
        openMenu(e, r ? { pointer: { x: e.clientX - r.left, y: e.clientY - r.top } } : {})
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setPointer(null)}
      onPointerDown={onPointerDown}
      onPointerUp={endSweep}
      onPointerCancel={endSweep}
    >
      <Content stage={stage} pointer={placing ? pointer : null} placed={placed} box={box} localOf={localOf} />
    </div>
  )
}

// localOf はポインタの位置を、紙のビューの左上から見た位置にする
type LocalOf = (e: PointerEvent<Element>) => Point | null

function Content({
  stage,
  pointer,
  placed,
  box,
  localOf,
}: {
  stage: StageView
  pointer: Point | null
  placed: Placing | null // 置こうとしている間の、押すと置く所（use-place-target.tsx）
  box: Rect | null
  localOf: LocalOf
}) {
  const t = useMessages(kit)
  return (
    <PaperFrame stage={stage} role="img" aria-label={t("Paper")}>
      <Items stage={stage} into={placed?.target?.parent ?? null} localOf={localOf} />
      {pointer && placed && <Ghost placed={placed} />}
      {box && (
        <div
          data-select-sweep
          className={styles.sweep}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </PaperFrame>
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
  reparent: boolean // 付け替えの道具のドラッグか（入れ替えずに、離した所の下の形の中へ入れる）
  movable: boolean // 動かせるか（動かせなければ、押して離したときの選び直しだけをする）
  release: readonly string[] | null // 動かさずに離したときの選択（変えなければ null）
  travelled: boolean // ポインタが動いたか
}

// 大きさを変えているドラッグ: つかんだ辺と、押したときのポインタの位置
interface Stretch {
  pointer: number
  item: string
  edges: Edges
  start: Point
}

// 開いたページのアイテム（ページが無ければ何も描かない）
// 動かす計算は残っているページで、描くのは下書きを重ねたページで行う。
// stage・into・localOf が変わらなければ描き直さない（紙をずらしただけでは描き直さない）。into は置こうとしている間の、押すと入る先の形
const Items = memo(function Items({
  stage,
  into,
  localOf,
}: {
  stage: StageView
  into: string | null
  localOf: LocalOf
}) {
  const catalog = useCoreCatalog()
  const page = usePage()
  const draft = useShownPage()
  const shownPage = useMemo(
    () => (page !== NO_PAGE && draft !== NO_PAGE ? settledDraft(catalog, page, draft) : null),
    [catalog, page, draft],
  )
  return page !== NO_PAGE && shownPage ? (
    <PageItems stage={stage} page={page} shownPage={shownPage} into={into} localOf={localOf} />
  ) : null
})

// ページのアイテム。ドラッグ中は、動かすアイテムを動いた量だけずらして描く。つなぐもののビューで包む
function PageItems({
  stage,
  page,
  shownPage,
  into,
  localOf,
}: {
  stage: StageView
  page: ItemPage
  shownPage: ItemPage
  into: string | null
  localOf: LocalOf
}) {
  const catalog = useCoreCatalog()
  const ui = useUiCatalog()
  // 描くページが、開いている物の中のページか（何も開いていなければ false）
  const opened = usePageById(page.id) !== NO_PAGE
  const followed = useFollowsSelection()
  // 可変ページなら、形を置ける広さ（空きの印刷区画を含む。base の roomOf）をステージの広さとして知らせる
  const room = useMemo(
    () => (opened && growOf(catalog, page) ? roomOf(catalog, page) : NO_AREA),
    [catalog, opened, page],
  )
  useStageArea(room)
  // ページに置けるつなぐもののビュー
  const connectors = allowedItems(catalog, page).flatMap(id => {
    const c = ui.connectors.get(id)
    return c ? [{ id, ...c }] : []
  })
  const move = useCommand(PAPER_MOVE.id)
  const reparent = useCommand(PAPER_REPARENT.id)
  // 付け替えの道具のドラッグで、離すと入れる先（形の id。null はページ。ドラッグしていなければ undefined）
  const [target, setTarget] = useState<string | null | undefined>(undefined)
  const edit = useCommand(PAPER_EDIT.id)
  const openMenu = useContextMenu(ITEM_CONTEXT)
  const { select } = useActions()
  const toPaperAt = useToPaper()
  const drag = useRef<Drag | null>(null)
  const [moved, setMoved] = useState<Point | null>(null)
  const resize = useCommand(PAPER_RESIZE.id)
  const stretch = useRef<Stretch | null>(null)
  const [stretched, setStretched] = useState<Point>({ x: 0, y: 0 }) // 大きさを変えているドラッグの、画面の上で動いた量
  const pans = stage.pans
  const [hover, setHover] = useState<string | null>(null) // ポインタを乗せている形
  // 離したばかりの形（離したあとの 1 回の描画だけ、つなぐもののビューに渡す）
  const settled = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (settled.current.size > 0) settled.current = new Set()
  })

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0 || pans || stage.placing !== NO_PLACING) return
    const reparenting = stage.tool === REPARENT_TOOL.id
    // 付け替えは押した形 1 つだけを動かす。選択の道具は Mod で足す・外す（placing/selection.ts の pressSelection）
    const press = reparenting
      ? { now: [id], drag: [id], release: null }
      : pressSelection(page, stage.selection, id, { mod: modPressed(e), followed })
    select(press.now)
    if (followed) return
    const items = shapesIn(page, press.drag)
    // 動かせないとき（認可ステップが止めるなど、コマンドを押せない。親の違う形が混じっている）は選ぶだけ
    const movable = (reparenting ? reparent.enabled : move.enabled) && opened && movableTogether(catalog, page, items)
    if (!movable && press.release === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      pointer: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      items,
      came: {},
      prev: { x: 0, y: 0 },
      swapped: false,
      reparent: reparenting,
      movable,
      release: press.release,
      travelled: false,
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    const screen = { x: e.clientX - d.start.x, y: e.clientY - d.start.y }
    if (screen.x !== 0 || screen.y !== 0) d.travelled = true
    if (!d.movable) return
    const by = toPaperDelta(stage, screen)
    if (d.reparent) {
      const at = localOf(e)
      const point = at && toPaperAt(at)
      setTarget(point && point !== NO_PAPER ? dropTarget(catalog, page, d.items[0] as string, point) : null)
    } else if (d.items.length === 1 && opened) {
      const id = d.items[0] as string
      d.came = trackDrag(catalog, page, id, d.prev, by, d.came)
      // 入れ替えが起きたら覚える（このドラッグの終わりまで）
      const plan = dragging(catalog, page, id, by, d.came)
      const moved = ([k, r]: [string, Rect]) => {
        const now = findShape(page, k)?.shape
        return k !== id && (r.x !== now?.x || r.y !== now?.y)
      }
      if ([...(plan ?? [])].some(moved)) d.swapped = true
    }
    d.prev = by
    setMoved(screen)
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, drop: boolean) => {
    const d = drag.current
    if (d?.pointer !== e.pointerId) return
    drag.current = null
    setMoved(null)
    setTarget(undefined)
    settled.current = new Set(d.items)
    if (drop && !d.travelled && d.release) select(d.release)
    if (!drop || !d.movable || !moved || (moved.x === 0 && moved.y === 0)) return
    if (d.reparent) reparent.run({ item: d.items[0] as string, parent: target ?? null, by: moved })
    else move.run({ items: d.items, by: moved, came: d.came })
  }
  const shift = moved && toPaperDelta(stage, moved)
  const d = drag.current
  const dragged = shift && d ? d.items : []
  const plan =
    shift && opened && d?.items.length === 1 && !d.reparent
      ? dragging(catalog, page, d.items[0] as string, shift, d.came)
      : null
  // ドラッグ中にずらして描く量（紙の上）
  const shiftOf = (item: PlacedShape): Point | null => shiftedBy(item, shift, plan, dragged)

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
  const area = areaOf(stage)
  const paper = area === NO_PAPER ? null : area
  // 大きさを変えている途中のアイテムは、変えたあとの左上と大きさで描く。ダイアログの下書きは、下書きを重ねたページ（useShownPage）のアイテムで描く（子の形も）
  const stretching = stretch.current && {
    item: stretch.current.item,
    edges: stretch.current.edges,
    by: toPaperDelta(stage, stretched),
  }
  const shown = (placed: PlacedShape): PlacedShape => shownShape(catalog, shownPage, placed, stretching, paper)
  const resizing = stretch.current && (stretched.x !== 0 || stretched.y !== 0) ? stretch.current.item : null
  const selectable = !pans && stage.placing === NO_PLACING
  // 描く形（下書き・大きさを変えている途中・ドラッグでずらした所を重ねたもの）
  const shapes = shapesOf(page).map(item => ({ item: shown(item), shift: shiftOf(item) }))
  // ドラッグでずらした形の両端が同じだけ動くつなぐものは、手直しの点も一緒にずらして描く（離したときのデータと同じ形。followConnectors）
  const slid = shift ? slidShapes(shownPage, shiftOf) : new Map<string, Point>()
  const scene: ShapeScene = {
    zoom: stage.zoom,
    page: slid.size > 0 ? followConnectors(catalog, shownPage, slid) : shownPage,
    rects: shownRects(catalog, shapes, c => {
      const item = shown(c)
      return { item, shift: shiftOf(item) }
    }),
    dragged,
    displaced: shapes.filter(({ item, shift }) => shift && !dragged.includes(item.id)).map(({ item }) => item.id),
    reordered: d?.swapped ?? false,
    released: settled.current,
    busy: dragged.length > 0 || resizing !== null,
    selectable,
    hover,
    localOf,
  }

  // 形 1 つと、その中の子の形（子は親の左上からの位置で、親の中に描く）
  const render = (item: PlacedShape, shift: Point | null): ReactNode => (
    <Item
      key={item.id}
      zoom={stage.zoom}
      item={item}
      onHover={on => setHover(h => (on ? item.id : h === item.id ? null : h))}
      overlays={connectors.flatMap(c => {
        const Overlay = c.overlay
        return Overlay
          ? [
              <TokenScope key={c.id} def={c.id}>
                <Overlay scene={scene} id={item.id} />
              </TokenScope>,
            ]
          : []
      })}
      nested={(item.shapes ?? []).map(c => {
        const shape = shown(c as PlacedShape)
        return render(shape, shiftOf(shape))
      })}
      stretchable={
        selectable && onlySelected(stage.selection, item.id) && minSize(catalog, item) !== null && resize.enabled
      }
      onStretch={{
        down: (e, edges) => startStretch(e, item.id, edges),
        move: moveStretch,
        up: e => endStretch(e, true),
        cancel: e => endStretch(e, false),
      }}
      selected={stage.selection.includes(item.id)}
      dropTarget={target === item.id || into === item.id}
      shift={shift}
      dragged={dragged}
      resizing={resizing}
      onPointerDown={e => onPointerDown(e, item.id)}
      onPointerMove={onPointerMove}
      onPointerUp={e => endDrag(e, true)}
      onPointerCancel={e => endDrag(e, false)}
      onDoubleClick={() => {
        if (pans || stage.placing !== NO_PLACING) return
        select([item.id])
        edit.run({ item: item.id })
      }}
      onContextMenu={e => {
        if (stage.placing !== NO_PLACING) return
        if (!stage.selection.includes(item.id)) select([item.id])
        openMenu(e, { item: item.id })
      }}
    />
  )
  const items = shapes.map(({ item, shift }) => render(item, shift))
  return connectors.reduceRight<ReactNode>((inner, c) => {
    const View = c.view
    return (
      <TokenScope key={c.id} def={c.id}>
        <View scene={scene}>{inner}</View>
      </TokenScope>
    )
  }, items)
}

// 置こうとしているアイテムの点線の箱。押すと置く所（箱の中に寄せた所・空き）に描き、置けない所（ページの紙からはみ出す・空きが無い）では薄く出す
function Ghost({ placed }: { placed: Placing }) {
  const { target, size } = placed
  const at = target?.shown ?? placed.at
  return (
    <div
      className={styles.ghost}
      data-fits={target?.fits === true}
      style={{ left: at.x, top: at.y, width: size.w, height: size.h }}
    />
  )
}
