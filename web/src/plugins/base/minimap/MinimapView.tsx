// ミニマップの絵: ステージの紙の全体を、幅 width・高さ height に収まるように縮めて描き（アイテムは marks.ts の絵）、見えている範囲を四角で重ねる。
// 四角をドラッグすると、ステージの見る所がついて動く。四角の外を押すと、そこが真ん中に来るように飛んでから、そのままドラッグできる
// （紙をずらさない道具の間に押すと、組の紙をずらす道具に替えてから動かす。組にそれが無ければ動かさない）。
// ミニマップの上でホイールを回すと、回した量をコマンド zoom-wheel に渡して、表示領域の真ん中を動かさずに拡大縮小する（ページはスクロールさせない）。
// 紙の色と絵の色はブックのテーマの値で描く。children は絵の下に出す（右ボタンの長押しのミニマップの、拡大縮小の帯）。className は枠の見た目を替える（無ければ浮かぶ枠）
import { memo, type PointerEvent, type ReactNode, useCallback, useMemo, useRef } from "react"
import type { Point } from "../../../core/geom"
import { paperOf } from "../../../core/stage"
import { toolSetOf } from "../../../core/tools"
import { toolOf } from "../../../core/workspace"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { themeVars } from "../../../ui/theme-vars"
import { useShownPage } from "../../../ui/view-hooks"
import { bookTokens } from "../book-look/look"
import { settingsAt } from "../book-settings"
import { kit } from "../kit"
import { keepsPan, panningTool } from "../tool-switch/tools"
import { ZOOM_WHEEL } from "../zoom"
import { fitScale, grabAt, panFor, seenRect } from "./geometry"
import styles from "./MinimapView.module.css"
import { type MinimapMark, minimapMarks } from "./marks"

export function MinimapView({
  stage: id,
  width,
  height,
  className,
  children,
}: {
  stage: string
  width: number
  height: number
  className?: string
  children?: ReactNode
}) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const stage = useMatomezuState(s => s.workspace.stages.find(st => st.id === id))
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === id)?.opened
    return o ? s.books[o.book] : undefined
  })
  const page = useShownPage(id)
  const held = useMatomezuState(s => keepsPan(catalog, toolOf(catalog, s.workspace, id, s.books)))
  const { panStageBy, focusStage, setTool } = useActions()
  const latest = useRef(stage)
  latest.current = stage
  const grab = useRef<{ pointer: number; dx: number; dy: number } | null>(null)
  const vars = useMemo(() => (book ? themeVars(bookTokens(catalog, book)) : undefined), [catalog, book])
  const marks = useMemo(
    () => (book && page ? minimapMarks(catalog, book.type, page, settingsAt(catalog, book, page)) : []),
    [catalog, book, page],
  )
  const wheel = useCommand(id, ZOOM_WHEEL.id)
  const wheelRef = useRef(wheel)
  wheelRef.current = wheel
  // ページのスクロールを止めるため、受け身でない受け取りで付ける（描かれたときに付く）
  const attachWheel = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!wheelRef.current.shown) return
      e.preventDefault()
      e.stopPropagation()
      wheelRef.current.run({ delta: e.deltaY })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])
  const paper = stage ? paperOf(stage) : null
  if (!stage || !book || !paper) return null
  const scale = fitScale(paper, width, height)
  const seen = stage.view ? seenRect(paper, stage.view, stage.pan, stage.zoom) : null

  // 押した所（紙の座標）
  const at = (e: PointerEvent<SVGSVGElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }
  // 見えている範囲の左上を紙の点 to にする
  const lookAt = (to: Point) => {
    const s = latest.current
    if (!s) return
    const want = panFor(to, s.zoom)
    panStageBy(id, want.x - s.pan.x, want.y - s.pan.y)
  }
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    focusStage(id)
    if (!seen) return
    if (held) {
      const set = stage ? toolSetOf(catalog, stage) : null
      const hand = set ? panningTool(catalog, set) : null
      if (!hand) return
      setTool(id, hand)
    }
    const { to, grab: g } = grabAt(seen, at(e))
    if (to) lookAt(to)
    e.currentTarget.setPointerCapture(e.pointerId)
    grab.current = { pointer: e.pointerId, dx: g.x, dy: g.y }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const g = grab.current
    if (!g || g.pointer !== e.pointerId) return
    const p = at(e)
    lookAt({ x: p.x - g.dx, y: p.y - g.dy })
  }
  const release = (e: PointerEvent<SVGSVGElement>) => {
    if (grab.current?.pointer === e.pointerId) grab.current = null
  }
  const line = 1 / scale // 画面で 1px の線
  return (
    <div ref={attachWheel} className={className ?? styles.minimap} style={vars}>
      <svg
        className={styles.map}
        role="img"
        aria-label={t("Minimap")}
        width={Math.round(paper.w * scale)}
        height={Math.round(paper.h * scale)}
        viewBox={`0 0 ${paper.w} ${paper.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <rect className={styles.paper} x={0} y={0} width={paper.w} height={paper.h} />
        {marks.map((m, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 絵は描くたびに作り直し、順番だけが手がかり
          <Mark key={i} mark={m} />
        ))}
        {seen && (
          <rect
            className={styles.seen}
            x={seen.x + line / 2}
            y={seen.y + line / 2}
            width={Math.max(0, seen.w - line)}
            height={Math.max(0, seen.h - line)}
            data-minimap-seen=""
          />
        )}
      </svg>
      {children}
    </div>
  )
}

// 絵 1 つ。絵が変わらなければ描き直さない（紙をずらして見えている範囲の四角が動いただけでは描き直さない）
const Mark = memo(function Mark({ mark: m }: { mark: MinimapMark }) {
  const pts = (list: readonly Point[]) => list.map(p => `${p.x},${p.y}`).join(" ")
  switch (m.kind) {
    case "rect":
      return <rect className={styles.shape} x={m.x} y={m.y} width={m.w} height={m.h} rx={m.rx} />
    case "ellipse":
      return <ellipse className={styles.shape} cx={m.x + m.w / 2} cy={m.y + m.h / 2} rx={m.w / 2} ry={m.h / 2} />
    case "polygon":
      return <polygon className={styles.shape} points={pts(m.points)} />
    case "polyline":
      return <polyline className={styles.line} points={pts(m.points)} />
  }
})
