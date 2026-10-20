// ステージのビュー（ウィジェット book-view）: ステージ（core/stage.ts）を読んで、与えられた枠の中に開いたブックを、そのタイプのビュー（プラグインが結んだもの）で描く。
// ブックの中はブックのテーマの値（CSS 変数）で描く。何も開いていなければ、ブックを選ぶ欄を真ん中に出す。
// 測った大きさと、ドラッグ・ホイールで動いた量を、そのまま store の操作に渡す（ずらす量の計算はステージの側）
import { type CSSProperties, memo, type PointerEvent, useMemo, useRef, useState, type WheelEvent } from "react"
import { fail } from "../../core/errors"
import type { BookTypeId } from "../../core/registry"
import { paperOf, type Stage } from "../../core/stage"
import { bookTokens } from "../../core/theme"
import { BookSearch } from "../../ui/book-search/BookSearch"
import { useT } from "../../ui/i18n"
import { useActions, useApp, useRegistry, useUi } from "../../ui/store-context"
import { themeVars } from "../../ui/theme-vars"
import { useResize } from "../../ui/use-resize"
import styles from "./StageView.module.css"

// ドラッグ中のポインタと、前に知らせた位置
interface Drag {
  pointer: number
  x: number
  y: number
}

export const StageView = memo(function StageView({ stage: id }: { stage: string }) {
  const stage = useApp(s => s.workspace.stages.find(st => st.id === id))
  const isCurrent = useApp(s => s.workspace.current === id)
  const isMulti = useApp(s => s.workspace.stages.length > 1)
  const book = useApp(s => {
    const o = s.workspace.stages.find(st => st.id === id)?.opened
    return o ? s.books[o.book] : undefined
  })
  const registry = useRegistry()
  const vars = useMemo(() => (book ? themeVars(bookTokens(registry, book)) : undefined), [registry, book])
  const { focusStage, resizeStage, panStageBy, openBook } = useActions()
  const t = useT()
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)
  useResize(ref, view => resizeStage(id, view))
  if (!stage) return null
  const hasPaper = paperOf(stage) !== null

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    focusStage(id)
    if (e.button !== 0 || !hasPaper) return
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
    const dx = e.shiftKey ? e.deltaY : e.deltaX
    const dy = e.shiftKey ? e.deltaX : e.deltaY
    panStageBy(id, -dx, -dy)
  }

  return (
    <section
      ref={ref}
      className={styles.stage}
      aria-label={t("ステージ")}
      data-current={isCurrent}
      data-multi={isMulti}
      data-paper={hasPaper}
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      {stage.opened && book ? (
        <BookContent stage={stage} type={stage.opened.type} vars={vars} />
      ) : (
        <div className={styles.empty}>
          <p className={styles.prompt}>{t("ブックを選択してください")}</p>
          <BookSearch onSelect={book => openBook(id, book)} />
        </div>
      )}
    </section>
  )
})

// 開いたブックを、そのタイプのビューで、テーマの値の中に描く
function BookContent({ stage, type, vars }: { stage: Stage; type: BookTypeId; vars: CSSProperties | undefined }) {
  const View = useUi().bookViews.get(type) ?? fail("E109", { kind: "bookType", id: type })
  return (
    <div className={styles.book} style={vars}>
      <View stage={stage} />
    </div>
  )
}
