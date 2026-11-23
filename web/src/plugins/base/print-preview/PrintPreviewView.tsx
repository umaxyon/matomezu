// 印刷プレビューのビュー: ステージで開いたステージエントリ（previewed.ts）の全ページの印刷区画を、並べ方（entry-sheets.ts）のとおりに紙の面で描き、
// 中身はページのタイプの印刷区画 1 つのビュー（printSheet）で描く（無ければ白紙。設定で、ブック名（バインダ名）・ページ名と印刷区画の番号を重ねる。SheetFrame）。何も載っていない印刷区画とページは並べず、
// 並べる物が 1 つも無ければ、表示領域の真ん中に印刷できるものが無いと知らせる。
// 並べた広さはステージに知らせ（初めは幅に合わせる）、ずらす量と倍率は編集と同じくステージが持つ。
// 見るだけで、アンカーもスタンドも置かず、右クリックのメニューも出さない。印刷区画をダブルクリックすると、そのページの編集に戻る。
// 右サイドパネルに印刷プレビューの中身を出していたのに出さなくなったら（閉じた・ほかの物に替わった）、印刷プレビューを閉じる。
// 初めから出ていなければ（AI が印刷プレビューで開いたときなど）、出す。
// 右サイドパネルに出している間、刷れるなら（測り終え、並べる物がある）、刷る物（PrintOutput）を置いておき、刷れるかをステージの状態に置く（印刷のコマンドが読む）

import { type ComponentType, type CSSProperties, useEffect, useMemo, useRef } from "react"
import { pagesOf } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import type { Size } from "../../../core/geom"
import type { Page } from "../../../core/schema/book"
import { NO_STAGE, NOTHING_OPENED, extentOf as previewArea } from "../../../core/stage"
import { paperOrigin } from "../../../core/viewport"
import { stageIn } from "../../../core/window"
import type { MatomezuState } from "../../../store/state"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { PageScope, useStageId } from "../../../ui/scope"
import { useCatalog, useMatomezuState, useReadState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { useStage, useStagePan } from "../../../ui/view-hooks"
import { settingValue } from "../book-settings"
import { kit } from "../kit"
import { paperSize } from "../place/grow"
import { useOpenRightSidePanelAt, useRightSidePanelAt, useSidePanelSliding } from "../right-side-panel/hooks"
import { useZoomMotion } from "../utils/useZoomMotion"
import { PRINT_PREVIEW_FIT } from "."
import { entrySheets, hasCrossing } from "./entry-sheets"
import { useMeasures, useReportMeasure, useSetPrintReady } from "./measures"
import type { PrintMeasured } from "./measures-state"
import { PrintOutput } from "./PrintOutput"
import styles from "./PrintPreviewView.module.css"
import { PRINT_PREVIEW_PANEL_ID, printCheckOpen } from "./panel-id"
import { sheetLabels } from "./print-pages"
import { Printing } from "./printing"
import { SheetFrame } from "./SheetFrame"
import { PRINT_PREVIEW_BOOK_NAME, PRINT_PREVIEW_PAGE_NAME, PRINT_PREVIEW_SHEET_NUMBERS } from "./settings"
import { usePreviewed } from "./usePreviewed"

// 印刷区画 1 つのビュー（プレゼンテーションのビューの定義の printSheet）が受け取る物: ページと、
// そのページを紙の大きさ paper で区切った column 列目・row 行目の印刷区画（0 から）。ビューはページの中身を、ページの原点で描く
// （印刷区画の左上が原点になるようずらし、はみ出した所を切るのは印刷プレビュー）。描く物を、その印刷区画に載る物に絞ってよい。入力は受けない
export interface PrintSheetProps {
  zoom: number // 描いている倍率（紙の上の 1px が画面の何 px か。画面の上で一定に描く線などに使う）
  page: Page
  column: number
  row: number
  paper: Size
  measured?: unknown // 測るだけのビュー（printMeasure）が知らせたデータ（測るプレゼンテーションだけ）
}

// 測るだけのビュー（プレゼンテーションのビューの定義の printMeasure）が受け取る物: ページと、紙の大きさ paper、測った結果を知らせる report。
// ページの中身を見えない所に描いて測り、印刷区画の数（rows。1 列に並べる）と、各印刷区画のビューに渡すデータ（data。印刷区画 1 つのビューの
// measured に届く）を知らせる。測り直すたびに知らせてよい（同じ結果なら並べ直さない）。入力は受けない
export interface PrintMeasureProps {
  page: Page
  paper: Size
  report(measured: PrintMeasured): void
}

export type { PrintMeasured } from "./measures-state"

declare module "../../../core/catalog" {
  interface PresentationViewExtras {
    // 印刷プレビューと印刷で、印刷区画 1 つの中身を描くビュー。無ければ白紙
    printSheet?: ComponentType<PrintSheetProps>
    // 印刷区画の数と切り方を、描いて測ってから決めるプレゼンテーション（マークダウンなど）が、ページごとに測るだけのビュー。印刷プレビューが見えない所に
    // ページ 1 つに 1 回描き、測り終えるまで、そのページの印刷区画は並べない
    printMeasure?: ComponentType<PrintMeasureProps>
  }
}

// ステージ stage の今の倍率（effect の中で読む）
const zoomOf = (read: () => MatomezuState, stage: string): number | null => stageIn(read().window, stage)?.zoom ?? null

// ステージ id の、ずらす量の範囲を決める広さを知らせたか（並べた広さ）と、表示領域の大きさ（"幅x高さ"。測る前は null）
function useExtent(id: string): { known: boolean; size: string | null } {
  const known = useMatomezuState(s => {
    const st = stageIn(s.window, id)
    return !!st && previewArea(st) !== null
  })
  const size = useMatomezuState(s => {
    const view = stageIn(s.window, id)?.view
    return view ? `${view.w}x${view.h}` : null
  })
  return { known, size }
}

// 描いている場所のステージがあるときだけ描く（無ければ何も描かない）
export function PrintPreviewView() {
  const id = useStageId()
  return id === NO_STAGE ? null : <PrintPreviewBody id={id} />
}

function PrintPreviewBody({ id }: { id: string }) {
  const stage = useStage() // パンの量を読まない（ずらす量は useStagePan だけが読む）
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const previewed = usePreviewed()
  const pan = useStagePan()
  const panel = useRightSidePanelAt(id)
  const { setPreviewArea, closePrintPreview, openPage } = useStoreActions()
  const read = useReadState()
  // 測るプレゼンテーションのページの、測った結果（ページの id → 結果。base が持つステージごとのプラグイン状態。measures.tsx）
  const entryId = previewed?.id
  const measures = useMeasures(entryId)
  const report = useReportMeasure(entryId)
  // ページごとの、知らせを受ける関数（同じ物を渡し続け、紙をずらしても測るだけのビューを描き直させない。ステージエントリが替われば作り直す）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 知らせる先（ステージエントリ）が替わったら表を空にする
  const reporters = useMemo(() => new Map<string, (m: PrintMeasured) => void>(), [report])
  // 測るだけのビューの入れ物。描かれていない間（刷るときは画面ごと隠れる）に届いた知らせは、0 を測っているので受けない
  const measureBox = useRef<HTMLDivElement>(null)
  const reporterOf = (page: string) => {
    const was = reporters.get(page)
    if (was) return was
    const made = (m: PrintMeasured) => {
      if (measureBox.current?.getClientRects().length === 0) return
      report(page, m)
    }
    reporters.set(page, made)
    return made
  }
  const pages = useMemo(() => (previewed ? pagesOf(previewed) : []), [previewed])
  // 測るページ（タイプのプレゼンテーションが測るビューを持ち、紙のあるページ）と、その紙の大きさと測るビュー
  const measuring = useMemo(
    () =>
      pages.flatMap(p => {
        const Measure = views.get(pageType(catalog, p.type).presentation)?.printMeasure
        const paper = paperSize(catalog, p)
        return Measure ? [{ page: p, paper, Measure }] : []
      }),
    [views, pages, catalog],
  )
  const measured = useMemo(
    () => new Map(measuring.map(({ page }) => [page.id, measures[page.id]?.rows ?? ("pending" as const)])),
    [measuring, measures],
  )
  const layout = useMemo(
    () => (previewed ? entrySheets(catalog, previewed, measured) : null),
    [catalog, previewed, measured],
  )
  const zoom = stage === NO_STAGE ? 1 : stage.zoom
  const motion = useZoomMotion(zoom, "")
  // 並べた広さを知らせる（測っている途中と、並べる物が無い間は知らせない。途中の広さで、初めの幅に合わせるのを済ませないように）
  const pending = [...measured.values()].includes("pending")
  useEffect(() => {
    if (layout && !pending && layout.sheets.length > 0) setPreviewArea(id, layout.size)
  }, [layout, pending, id, setPreviewArea])
  // 刷れるか（測り終え、並べる印刷区画が 1 つ以上ある。印刷のコマンドが読む）
  const ready = !!layout && !pending && layout.sheets.length > 0
  const setPrintReady = useSetPrintReady()
  useEffect(() => setPrintReady(ready), [ready, setPrintReady])
  const shown = panel?.widget === PRINT_PREVIEW_PANEL_ID
  // 初めは、並べる向きと交わる辺を表示領域に合わせる（幅に合わせる。print-preview-fit）。右サイドパネルが出て表示領域が狭まり終えてから合わせ、
  // そのあと表示領域の大きさが変わっても、倍率を変えていなければ合わせ直す
  const fit = useCommand(PRINT_PREVIEW_FIT.id)
  const fitRef = useRef(fit)
  fitRef.current = fit
  const sliding = useSidePanelSliding(shown ? id : null)
  const fitted = useRef<{ zoom: number | null; size: string } | null>(null) // 収めたときの倍率と表示領域の大きさ
  const { known, size } = useExtent(id)
  useEffect(() => {
    if (!known || size === null || !shown || sliding) return
    const last = fitted.current
    if (last && (last.size === size || last.zoom !== zoomOf(read, id))) return
    fitRef.current.run()
    fitted.current = { zoom: zoomOf(read, id), size }
  }, [known, size, shown, sliding, id, read])
  const openPanel = useOpenRightSidePanelAt()
  const seen = useRef(false) // 右サイドパネルに中身を出したか
  const opened = stage === NO_STAGE || stage.opened === NOTHING_OPENED ? null : stage.opened
  // 印刷区画の境目をまたいだ形を直してもらうタイプで、またいだ形があれば（AI が印刷プレビューで開いた・開いている間に AI が動かした）、
  // 印刷プレビューを閉じて、それを知らせる右サイドパネルを開く（フッタメニューのボタンと同じ）
  const crossing = useMemo(() => !!previewed && hasCrossing(catalog, previewed), [catalog, previewed])
  useEffect(() => {
    if (!crossing || !opened) return
    closePrintPreview(id)
    openPanel(id, printCheckOpen(opened.outermost.id))
  }, [crossing, id, opened, closePrintPreview, openPanel])
  useEffect(() => {
    if (crossing) return
    if (shown) seen.current = true
    else if (seen.current) closePrintPreview(id)
    // 閉じたときに戻す見え方は印刷プレビューが持つので、右サイドパネルの戻しは使わない
    else if (opened)
      openPanel(
        id,
        { widget: PRINT_PREVIEW_PANEL_ID, subject: opened.outermost.id, anchors: [], current: opened.outermost.id },
        "none",
      )
  }, [crossing, shown, id, opened, closePrintPreview, openPanel])
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
  if (!layout || pan === NO_STAGE || !previewed) return null
  const pageOf = (pageId: string) => pages.find(p => p.id === pageId)
  // ブック名（バインダ名）・ページ名と印刷区画の番号（設定で入れるときだけ。番号は並べた印刷区画全体の通し）
  const shows = {
    sheetNumbers: settingValue(catalog, previewed.holder, PRINT_PREVIEW_SHEET_NUMBERS) === "shown",
    bookName: settingValue(catalog, previewed.holder, PRINT_PREVIEW_BOOK_NAME) === "shown",
    pageName: settingValue(catalog, previewed.holder, PRINT_PREVIEW_PAGE_NAME) === "shown",
  }
  const labelsOf = (s: { index: number; page: string }) =>
    sheetLabels(s.index, layout.sheets.length, shows, {
      book: previewed.name,
      page: pageOf(s.page)?.title ?? "",
    })
  const origin = paperOrigin(pan)
  // 測るだけのビュー（見えない所に、倍率をかけずに描く）
  const measuringViews = measuring.length > 0 && (
    <div ref={measureBox} className={styles.measure} aria-hidden="true">
      <Printing>
        {measuring.map(({ page: p, paper, Measure }) => (
          // 測るページを、ステージの外で見るだけに描くページとして描く
          <PageScope key={p.id} outermost={previewed.id} page={p.id} zoom={1}>
            <Measure page={p} paper={paper} report={reporterOf(p.id)} />
          </PageScope>
        ))}
      </Printing>
    </div>
  )
  if (layout.sheets.length === 0)
    return (
      <>
        {measuringViews}
        {!pending && <p className={styles.nothing}>{t("Nothing to print")}</p>}
      </>
    )
  return (
    <>
      {measuringViews}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューを出さないだけ（印刷プレビューにメニューは無い） */}
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
            key={keyOf(s)}
            className={styles.sheet}
            style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
            data-sheet={s.index}
            data-sheet-page={s.page}
          >
            <SheetFrame
              zoom={zoom}
              entry={previewed.id}
              page={pageOf(s.page)}
              sheet={s}
              measured={measures[s.page]?.data}
              labels={labelsOf(s)}
            />
          </div>
        ))}
      </div>
      {shown && ready && opened && (
        <PrintOutput
          stage={id}
          entry={previewed.id}
          sheets={layout.sheets.map(s => ({
            ...s,
            key: keyOf(s),
            page: pageOf(s.page),
            measured: measures[s.page]?.data,
            labels: labelsOf(s),
          }))}
        />
      )}
    </>
  )
}

const keyOf = (s: { page: string; column: number; row: number }) => `${s.page}:${s.column}:${s.row}`
