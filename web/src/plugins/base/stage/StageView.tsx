// ステージのビュー（ウィジェット book-view）: ステージ（core/stage.ts）を読んで、与えられた枠の中に開いたブックを、レイヤー（スロット book-layers。
// 紙の面のレイヤー・そのタイプのビューを描くレイヤーなど）を並べた順に下から重ねて描く。ブックの中はブックのテーマの値と文字の色の値（CSS 変数）で描く。ブックの設定のダイアログの下書き（アイテムを指さないもの）があれば、ブックの項目に重ねて決める。何も開いていなければ、ブックを探すコンポーネントを真ん中に出す。
// 紙をずらす道具（pans）の間は、ステージの中のどこでもポインタを手にする（中のアイテムのカーソルより強い。ドラッグ中は握った手）。
// 測った大きさと、ドラッグ（ハンドの道具のとき）・ホイール（紙をずらさない道具のときは除く）で動いた量を、そのまま store の操作に渡す（ずらす量の計算はステージの側）。
// ホイールは、ポインタの下にその向きへまだスクロールできる物（リストの行の並び・データの表など）があればその物が受け、紙はずらさない。一続きの回しは始めに決めた物が受け、
// 中の物が端に着いたら、手を止めて次に回したときから紙をずらす（wheel-chain.ts）。
// Ctrl+ホイール（Mac は Cmd も。ピンチも）は、回した量とポインタの位置をそのままコマンド zoom-wheel に渡す（倍率はコマンドが決める。
// コマンドが出ているステージならブラウザの拡大は止める）
import {
  type CSSProperties,
  memo,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react"
import type { BookTypeId } from "../../../core/core-catalog"
import { paperOf } from "../../../core/stage"
import { toolDef } from "../../../core/tools"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { Slot } from "../../../ui/Slot"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useTokenScope } from "../../../ui/theme-vars"
import { useBook, useStage } from "../../../ui/view-hooks"
import { useBookThemeVars } from "../book-look/use-book-theme-vars"
import { BookSearch } from "../book-open/BookSearch"
import { kit } from "../kit"
import { textColorVars } from "../text"
import { useTextColors } from "../text/use-text-colors"
import { keepsPan } from "../tool-switch/tools"
import { AnchorsProvider } from "../utils/anchors"
import { useResize } from "../utils/useResize"
import { BOOK_LAYERS } from "../workspace/slots"
import { ZOOM_WHEEL } from "../zoom"
import styles from "./StageView.module.css"
import { scrollsInside, type WheelLatch, wheelTaker } from "./wheel-chain"

// ドラッグ中のポインタと、前に知らせた位置
interface Drag {
  pointer: number
  x: number
  y: number
}

export const StageView = memo(function StageView({ stage: id }: { stage: string }) {
  const stage = useStage(id) // パンの量を読まない（パンのたびに描き直さない）
  const isCurrent = useMatomezuState(s => s.workspace.current === id)
  const book = useBook(id)
  const catalog = useCatalog().core
  const tool = stage?.tool ?? null
  const pans = tool !== null && toolDef(catalog, tool).pans === true // ドラッグで紙をずらす道具
  // ブックのテーマの値と、文字の色の値（どちらもブックの設定のダイアログの下書きを重ねる）
  const theme = useBookThemeVars(id)
  const colors = useTextColors(id)
  const vars = useMemo(() => (colors ? { ...theme, ...textColorVars(colors) } : undefined), [theme, colors])
  const { focusStage, resizeStage, panStageBy, openBook } = useActions()
  const wheelZoom = useCommand(id, ZOOM_WHEEL.id)
  const t = useMessages(kit)
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)
  useResize(ref, view => resizeStage(id, view))
  const wheel = useRef({ zoom: wheelZoom, keepsPan: keepsPan(catalog, tool) })
  wheel.current = { zoom: wheelZoom, keepsPan: keepsPan(catalog, tool) }
  const latch = useRef<WheelLatch | null>(null) // 一続きの回しで決めた、ホイールを受ける物
  // ホイールを受ける物を決める（ブラウザの拡大と、紙をずらす回しで中の物がスクロールするのを止めるため、受け身でない受け取りで付ける）。
  // 紙をずらすのは React の onWheel（中のビューやスタンドが止めたホイールでは紙をずらさない）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: globalThis.WheelEvent) => {
      const w = wheel.current
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+ホイールの拡大縮小
        if (!w.zoom.shown) return
        e.preventDefault()
        const r = el.getBoundingClientRect()
        w.zoom.run({ delta: e.deltaY, at: { x: e.clientX - r.left, y: e.clientY - r.top } })
        return
      }
      if (w.keepsPan) return
      const dx = e.shiftKey ? e.deltaY : e.deltaX
      const dy = e.shiftKey ? e.deltaX : e.deltaY
      const at = performance.now()
      const taker = wheelTaker(latch.current, at, scrollsInside(e.target, el, dx, dy))
      latch.current = { taker, at }
      if (taker === "stage") e.preventDefault()
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])
  if (!stage) return null
  const hasPaper = paperOf(stage) !== null

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    focusStage(id)
    if (e.button !== 0 || !hasPaper || !pans) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY }
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    panStageBy(id, e.clientX - d.x, e.clientY - d.y)
    d.x = e.clientX
    d.y = e.clientY
  }
  const endDrag = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointer !== e.pointerId) return
    drag.current = null
    setDragging(false)
  }
  const onWheel = (e: WheelEvent<HTMLElement>) => {
    if (e.ctrlKey || e.metaKey || keepsPan(catalog, tool) || latch.current?.taker !== "stage") return
    const dx = e.shiftKey ? e.deltaY : e.deltaX
    const dy = e.shiftKey ? e.deltaX : e.deltaY
    panStageBy(id, -dx, -dy)
  }

  return (
    <section
      ref={ref}
      className={styles.stage}
      aria-label={t("Stage")}
      data-stage={id}
      data-current={isCurrent}
      data-paper={hasPaper}
      data-tool={tool ?? undefined}
      data-pans={hasPaper && pans}
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      {stage.opened && book ? (
        <BookContent stage={id} type={stage.opened.type} vars={vars} />
      ) : (
        <div className={styles.empty}>
          <p className={styles.prompt}>{t("Select a book")}</p>
          <BookSearch onSelect={book => openBook(id, book)} />
        </div>
      )}
    </section>
  )
})

// 開いたブックを、レイヤーを重ねて、テーマの値の中に描く（アンカーの表はレイヤーみんなで使う）
function BookContent({ stage, type, vars }: { stage: string; type: BookTypeId; vars: CSSProperties | undefined }) {
  const tokens = useTokenScope(type) // ブックのタイプのプラグインのテーマキー（--<名前>）
  return (
    <div className={styles.book} style={{ ...vars, ...tokens }}>
      <AnchorsProvider stage={stage}>
        <Slot name={BOOK_LAYERS} props={{ stage }} />
      </AnchorsProvider>
    </div>
  )
}
