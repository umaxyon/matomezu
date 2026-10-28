// ステージのビュー（ウィジェット book-view）: ステージ（core/stage.ts）を読んで、与えられた枠の中に開いたブックを、そのタイプのビュー（プラグインが結んだもの）で描く。
// ブックの中はブックのテーマの値（CSS 変数）で描く。ブックの設定のダイアログの下書き（アイテムを指さないもの）があれば、ブックの項目に重ねて決める。何も開いていなければ、ブックを探すコンポーネントを真ん中に出す。
// 測った大きさと、ドラッグ（ハンドの道具のとき）・ホイール（紙をずらさない道具のときは除く）で動いた量を、そのまま store の操作に渡す（ずらす量の計算はステージの側）
import { type CSSProperties, memo, type PointerEvent, useMemo, useRef, useState, type WheelEvent } from "react"
import { withSettings } from "../../../core/book"
import { type BookTypeId, bookType } from "../../../core/core-catalog"
import { fail } from "../../../core/errors"
import type { Book } from "../../../core/schema/book"
import { paperOf, type Stage } from "../../../core/stage"
import { toolDef } from "../../../core/tools"
import { toolOf } from "../../../core/workspace"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { themeVars, useTokenScope } from "../../../ui/theme-vars"
import { useResize } from "../../../ui/use-resize"
import { bookTokens } from "../book-look/look"
import { BookSearch } from "../book-open/BookSearch"
import { kit } from "../kit"
import { keepsPan } from "../tool-switch/tools"
import styles from "./StageView.module.css"

// ドラッグ中のポインタと、前に知らせた位置
interface Drag {
  pointer: number
  x: number
  y: number
}

export const StageView = memo(function StageView({ stage: id }: { stage: string }) {
  const stage = useMatomezuState(s => s.workspace.stages.find(st => st.id === id))
  const isCurrent = useMatomezuState(s => s.workspace.current === id)
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === id)?.opened
    return o ? s.books[o.book] : undefined
  })
  const preview = useMatomezuState(s => s.dialog?.preview ?? null)
  const look =
    preview && preview.item === undefined && preview.page === undefined && preview.book === book?.id
      ? preview.props
      : null
  const catalog = useCatalog().core
  const tool = useMatomezuState(s => toolOf(catalog, s.workspace, id))
  const pans = tool !== null && toolDef(catalog, tool).pans === true // ドラッグで紙をずらす道具
  const vars = useMemo(
    () => (book ? themeVars(bookTokens(catalog, look ? withSettings<Book>(book, look) : book)) : undefined),
    [catalog, book, look],
  )
  const { focusStage, resizeStage, panStageBy, openBook } = useActions()
  const t = useMessages(kit)
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)
  useResize(ref, view => resizeStage(id, view))
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
    if (keepsPan(catalog, tool)) return
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
          <p className={styles.prompt}>{t("Select a book")}</p>
          <BookSearch onSelect={book => openBook(id, book)} />
        </div>
      )}
    </section>
  )
})

// 開いたブックを、そのタイプが選んだ見せ方のビューで、テーマの値の中に描く
function BookContent({ stage, type, vars }: { stage: Stage; type: BookTypeId; vars: CSSProperties | undefined }) {
  const presentation = bookType(useCatalog().core, type).presentation
  const View = (
    useUiCatalog().presentationViews.get(presentation) ?? fail("E109", { kind: "presentation", id: presentation })
  ).view
  const tokens = useTokenScope(type) // ブックのタイプのプラグインのテーマキー（--<名前>）
  return (
    <div className={styles.book} style={{ ...vars, ...tokens }}>
      <View stage={stage.id} />
    </div>
  )
}
