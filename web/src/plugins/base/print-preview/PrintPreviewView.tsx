// 印刷プレビューのビュー: ステージで開いたブックの全ページの印刷区画を、並べ方（book-sheets.ts）のとおりに紙の面で描き、
// 中身はブックのタイプの印刷区画 1 つのビュー（printSheet）で描く（無ければ白紙）。
// 並べた広さはステージに知らせ（初めは幅に合わせる）、ずらす量と倍率は編集と同じくステージが持つ。
// 見るだけで、アンカーもスタンドも置かず、右クリックのメニューも出さない。印刷区画をダブルクリックすると、そのページの編集に戻る。
// 右サイドパネルに印刷プレビューの中身を出していたのに出さなくなったら（閉じた・ほかの物に替わった）、印刷プレビューを閉じる。
// 初めから出ていなければ（URL から印刷プレビューで開いたとき）、出す
import { type ComponentType, type CSSProperties, useEffect, useMemo, useRef } from "react"
import { pagedOf } from "../../../core/book"
import { bookType } from "../../../core/core-catalog"
import type { Size } from "../../../core/geom"
import type { Book, Page } from "../../../core/schema/book"
import { extentOf as previewArea } from "../../../core/stage"
import { paperOrigin } from "../../../core/viewport"
import type { MatomezuState } from "../../../store/store"
import { useCommand } from "../../../ui/commands"
import { useActions, useCatalog, useMatomezuState, useReadState, useUiCatalog } from "../../../ui/store-context"
import { useBook, useStage, useStagePan } from "../../../ui/view-hooks"
import { useOpenRightSidePanel, useRightSidePanel, useRightSidePanelSliding } from "../right-side-panel/hooks"
import { useZoomMotion } from "../utils/useZoomMotion"
import { PRINT_PREVIEW_FIT } from "."
import { bookSheets } from "./book-sheets"
import styles from "./PrintPreviewView.module.css"
import { PRINT_PREVIEW_PANEL_ID } from "./panel-id"
import { PrintingContext } from "./printing"

// 印刷区画 1 つのビュー（ブックのビューの定義の printSheet）が受け取る物: 描いているステージ（印刷プレビューの間）・ブック・ページと、
// そのページを紙の大きさ paper で区切った column 列目・row 行目の印刷区画（0 から）。ビューはページの中身を、ページの原点で描く
// （印刷区画の左上が原点になるようずらし、はみ出した所を切るのは印刷プレビュー）。描く物を、その印刷区画に載る物に絞ってよい。入力は受けない
export interface PrintSheetProps {
  stage: string
  book: Book
  page: Page
  column: number
  row: number
  paper: Size
}

declare module "../../../core/catalog" {
  interface BookViewExtras {
    // 印刷プレビューと印刷で、印刷区画 1 つの中身を描くビュー。無ければ白紙
    printSheet?: ComponentType<PrintSheetProps>
  }
}

// ステージ stage の今の倍率（effect の中で読む）
const zoomOf = (read: () => MatomezuState, stage: string): number | null =>
  read().workspace.stages.find(st => st.id === stage)?.zoom ?? null

// ステージ id の、ずらす量の範囲を決める広さを知らせたか（並べた広さ）と、表示領域の大きさ（"幅x高さ"。測る前は null）
function useExtent(id: string): { known: boolean; size: string | null } {
  const known = useMatomezuState(s => {
    const st = s.workspace.stages.find(st => st.id === id)
    return !!st && previewArea(st) !== null
  })
  const size = useMatomezuState(s => {
    const view = s.workspace.stages.find(st => st.id === id)?.view
    return view ? `${view.w}x${view.h}` : null
  })
  return { known, size }
}

export function PrintPreviewView({ stage: id }: { stage: string }) {
  const stage = useStage(id) // パンの量を読まない（ずらす量は useStagePan だけが読む）
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const book = useBook(id)
  const pan = useStagePan(id)
  const panel = useRightSidePanel(id)
  const { setPreviewArea, closePrintPreview, openPage } = useActions()
  const read = useReadState()
  const layout = useMemo(() => (book ? bookSheets(catalog, book) : null), [catalog, book])
  const zoom = stage?.zoom ?? 1
  const motion = useZoomMotion(zoom, "")
  useEffect(() => {
    if (layout) setPreviewArea(id, layout.size)
  }, [layout, id, setPreviewArea])
  const shown = panel?.widget === PRINT_PREVIEW_PANEL_ID
  // 初めは、並べる向きと交わる辺を表示領域に合わせる（幅に合わせる。print-preview-fit）。右サイドパネルが出て表示領域が狭まり終えてから合わせ、
  // そのあと表示領域の大きさが変わっても、倍率を変えていなければ合わせ直す
  const fit = useCommand(id, PRINT_PREVIEW_FIT.id)
  const fitRef = useRef(fit)
  fitRef.current = fit
  const sliding = useRightSidePanelSliding(shown ? id : null)
  const fitted = useRef<{ zoom: number | null; size: string } | null>(null) // 収めたときの倍率と表示領域の大きさ
  const { known, size } = useExtent(id)
  useEffect(() => {
    if (!known || size === null || !shown || sliding) return
    const last = fitted.current
    if (last && (last.size === size || last.zoom !== zoomOf(read, id))) return
    fitRef.current.run()
    fitted.current = { zoom: zoomOf(read, id), size }
  }, [known, size, shown, sliding, id, read])
  const openPanel = useOpenRightSidePanel()
  const seen = useRef(false) // 右サイドパネルに中身を出したか
  const opened = stage?.opened ?? null
  useEffect(() => {
    if (shown) seen.current = true
    else if (seen.current) closePrintPreview(id)
    // 閉じたときに戻す見え方は印刷プレビューが持つので、右サイドパネルの戻しは使わない
    else if (opened)
      openPanel(id, { widget: PRINT_PREVIEW_PANEL_ID, subject: opened.book, anchors: [], current: opened.book }, "none")
  }, [shown, id, opened, closePrintPreview, openPanel])
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
      if (sheetPage) openPage(id, sheetPage)
    }
    el.addEventListener("dblclick", onDoubleClick)
    return () => el.removeEventListener("dblclick", onDoubleClick)
  }, [id, openPage])
  if (!layout || !pan || !book) return null
  const Sheet = views.get(bookType(catalog, book.type).presentation)?.printSheet
  const pages = pagedOf(book)?.pages ?? []
  const pageOf = (pageId: string) => pages.find(p => p.id === pageId)
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
          transform: `translate(${origin.x}px, ${origin.y}px) scale(${zoom})`,
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
        >
          {Sheet && pageOf(s.page) && (
            // 印刷区画の左上が原点になるよう、ページの原点をずらす（はみ出した所は印刷区画の枠が切る）
            <div className={styles.origin} style={{ left: -s.column * s.w, top: -s.row * s.h }}>
              <PrintingContext.Provider value={true}>
                <Sheet
                  stage={id}
                  book={book as Book}
                  page={pageOf(s.page) as Page}
                  column={s.column}
                  row={s.row}
                  paper={{ w: s.w, h: s.h }}
                />
              </PrintingContext.Provider>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
