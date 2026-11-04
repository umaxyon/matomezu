// 印刷プレビューのビュー: ステージで開いたブックの全ページの印刷区画を、並べ方（book-sheets.ts）のとおりに紙の面で描く（中身はまだ描かない）。
// 並べた広さはステージに知らせ（初めは開いていたページの最初の印刷区画を見せる）、ずらす量と倍率は編集と同じくステージが持つ。
// 見るだけで、アンカーもスタンドも置かず、右クリックのメニューも出さない。印刷区画をダブルクリックすると、そのページの編集に戻る。
// 右サイドパネルに印刷プレビューの中身を出していたのに出さなくなったら（閉じた・ほかの物に替わった）、印刷プレビューを閉じる。
// 初めから出ていなければ（URL から印刷プレビューで開いたとき）、出す
import { type CSSProperties, useEffect, useMemo, useRef } from "react"
import type { Stage } from "../../../core/stage"
import { paperOrigin } from "../../../core/viewport"
import { useActions, useCatalog } from "../../../ui/store-context"
import { useBook, useStagePan } from "../../../ui/view-hooks"
import { useOpenRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import { useZoomMotion } from "../utils/useZoomMotion"
import { bookSheets } from "./book-sheets"
import styles from "./PrintPreviewView.module.css"
import { PRINT_PREVIEW_PANEL_ID } from "./panel-id"

export function PrintPreviewView({ stage }: { stage: Stage }) {
  const catalog = useCatalog().core
  const book = useBook(stage.id)
  const pan = useStagePan(stage.id)
  const panel = useRightSidePanel(stage.id)
  const { setPreviewArea, closePrintPreview, openPage } = useActions()
  const layout = useMemo(() => (book ? bookSheets(catalog, book) : null), [catalog, book])
  const motion = useZoomMotion(stage.zoom, "")
  const page = stage.opened?.page ?? null
  useEffect(() => {
    if (!layout) return
    const first = layout.sheets.find(s => s.page === page) ?? layout.sheets[0]
    setPreviewArea(stage.id, layout.size, first ? { x: first.x, y: first.y } : { x: 0, y: 0 })
  }, [layout, page, stage.id, setPreviewArea])
  const shown = panel?.widget === PRINT_PREVIEW_PANEL_ID
  const openPanel = useOpenRightSidePanel()
  const seen = useRef(false) // 右サイドパネルに中身を出したか
  const bookId = stage.opened?.book
  useEffect(() => {
    if (shown) seen.current = true
    else if (seen.current) closePrintPreview(stage.id)
    else if (bookId)
      openPanel(stage.id, { widget: PRINT_PREVIEW_PANEL_ID, subject: bookId, anchors: [], current: bookId })
  }, [shown, stage.id, bookId, closePrintPreview, openPanel])
  // ダブルクリックは、ずらすドラッグでステージがポインタをつかむので、ステージで受けて押した所の印刷区画を探す
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.closest("[data-stage]")
    if (!el) return
    const onDoubleClick = (e: Event) => {
      const { clientX, clientY } = e as MouseEvent
      const hit = document
        .elementsFromPoint(clientX, clientY)
        .find(x => x instanceof HTMLElement && x.dataset.sheetPage)
      const sheetPage = hit instanceof HTMLElement ? hit.dataset.sheetPage : undefined
      if (sheetPage) openPage(stage.id, sheetPage)
    }
    el.addEventListener("dblclick", onDoubleClick)
    return () => el.removeEventListener("dblclick", onDoubleClick)
  }, [stage.id, openPage])
  if (!layout || !pan) return null
  const origin = paperOrigin(pan)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューを出さないだけ（印刷プレビューにメニューは無い）
    <div
      ref={ref}
      data-print-preview={layout.sheets.length}
      onContextMenu={e => e.preventDefault()}
      style={
        {
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          width: layout.size.w,
          height: layout.size.h,
          transform: `translate(${origin.x}px, ${origin.y}px) scale(${stage.zoom})`,
          transition: motion,
        } as CSSProperties
      }
    >
      {layout.sheets.map(s => (
        <div
          key={`${s.page}:${s.column}:${s.row}`}
          className={styles.sheet}
          style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
          data-sheet={s.index}
          data-sheet-page={s.page}
        />
      ))}
    </div>
  )
}
