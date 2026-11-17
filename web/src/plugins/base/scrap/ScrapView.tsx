// スクラップの中を描く部品: スクラップ（scrap.ts。指すページの id・見る範囲・倍率）を、置いたときの大きさ（scrapSize）の枠に描く。ページを、そのページのブックの見た目で、見るだけに描く
// （ステージの外で、見るだけに描くページ。ui/scope.tsx）。指す先のページが無ければ No Data、スクラップをたどって同じページに戻ったら輪の印を描く（どちらも灰色の枠）。
// 範囲は可変ページの中身の位置で持つ（中身を右・下へずらしたら、ずらした分だけ先を描く）
import { createContext, type ReactNode, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { pageById } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import type { Size } from "../../../core/geom"
import type { ItemPage } from "../../../core/placed"
import type { Book, Page } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { PageScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { usePageLookStyle } from "../book-look/use-page-look-style"
import { kit } from "../kit"
import { pageArea, paperSize } from "../place/items"
import type { PrintMeasured } from "../print-preview/measures-state"
import { Printing } from "../print-preview/printing"
import { SheetLayers } from "../print-preview/SheetLayers"
import styles from "./ScrapView.module.css"
import { areaOnPage, type Scrap, scrapSize, shiftOf } from "./scrap"

// 描いている途中のスクラップがたどったページの id。同じページに戻ったら輪
const TracedContext = createContext<readonly string[]>([])

export interface ScrapViewProps {
  scrap: Scrap
  zoom?: number // 枠を描く所の倍率（ステージの倍率など。中の物が画面の上で一定に描く線などに使う。無ければ 1）
}

export type ScrapState = "shown" | "none" | "loop"

export function ScrapView({ scrap, zoom = 1 }: ScrapViewProps) {
  const { page: pageId, area, scale } = scrap
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const traced = useContext(TracedContext)
  // ページの見た目と設定は、今そのページを持っているブックから引く
  const found = useMatomezuState(
    useShallow(s => {
      const at = pageById(s.books, pageId)
      return { book: at?.book ?? null, page: (at?.page as ItemPage | undefined) ?? null }
    }),
  )
  const { book, page } = found
  const state: ScrapState = !book || !page ? "none" : traced.includes(pageId) ? "loop" : "shown"
  const placed = scrapSize(scrap)
  const frame = { width: placed.w, height: placed.h }
  const size = book && page ? pageArea(catalog, page)?.size : undefined
  const paper = page ? paperSize(catalog, page) : null
  const inner = useMemo(() => [...traced, pageId], [traced, pageId])
  if (state !== "shown" || !book || !page || !size || !paper)
    return (
      <div className={`${styles.frame} ${styles.empty}`} data-scrap={state === "loop" ? "loop" : "none"} style={frame}>
        {state === "loop" ? <LoopMark /> : t("No Data")}
      </div>
    )
  const at = areaOnPage(area, shiftOf(catalog, page))
  return (
    <div className={styles.frame} data-scrap="shown" style={frame}>
      <TracedContext.Provider value={inner}>
        <PageScope book={book.id} page={page.id} zoom={zoom * scale}>
          <div className={styles.moved} style={{ transform: `scale(${scale}) translate(${-at.x}px, ${-at.y}px)` }}>
            <DrawnSheet book={book} page={page} size={size} />
          </div>
        </PageScope>
      </TracedContext.Provider>
    </div>
  )
}

// ステージの外で、見るだけに描くページ stage の中身: そのブックの見た目で、印刷区画 1 つのビュー（sheet-layers）を描く。
// 紙のプレゼンテーションなどは、ページの広さ size を 1 つの印刷区画として描く。描く前に測るプレゼンテーション（printMeasure。マークダウンなど）は、見えない所で測ってから、
// 測った数の印刷区画を紙の大きさで縦に並べる（広さは紙の幅 × 印刷区画の数の高さ。onSize で知らせる）
export function DrawnSheet({
  book,
  page,
  size,
  onSize,
  children,
}: {
  book: Book
  page: Page
  size: Size
  onSize?: (size: Size) => void
  children?: ReactNode
}) {
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const Measure = views.get(pageType(catalog, page.type).presentation)?.printMeasure
  const paper = paperSize(catalog, page as ItemPage)
  const look = usePageLookStyle()
  const [measured, setMeasured] = useState<PrintMeasured | null>(null)
  const report = useCallback(
    (m: PrintMeasured) =>
      setMeasured(was => (was && was.rows === m.rows && JSON.stringify(was.data) === JSON.stringify(m.data) ? was : m)),
    [],
  )
  const shown = Measure && paper ? (measured ? { w: paper.w, h: paper.h * measured.rows } : null) : size
  const w = shown?.w
  const h = shown?.h
  useLayoutEffect(() => {
    if (w !== undefined && h !== undefined) onSize?.({ w, h })
  }, [w, h, onSize])
  return (
    <div className={styles.sheet} style={{ ...look, width: shown?.w ?? size.w, height: shown?.h ?? size.h }}>
      {Measure && paper && (
        <div className={styles.measure} aria-hidden="true">
          <Printing>
            <Measure book={book} page={page} paper={paper} report={report} />
          </Printing>
        </div>
      )}
      <Printing>
        {Measure && paper ? (
          measured &&
          Array.from({ length: measured.rows }, (_, row) => (
            <SheetLayers
              // biome-ignore lint/suspicious/noArrayIndexKey: 印刷区画は上からの順で、並べ替えない
              key={row}
              book={book}
              page={page}
              column={0}
              row={row}
              paper={paper}
              measured={measured.data}
            />
          ))
        ) : (
          <SheetLayers book={book} page={page} column={0} row={0} paper={size} />
        )}
      </Printing>
      {children}
    </div>
  )
}

// 輪の印（たどると同じページに戻るスクラップ）
function LoopMark() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
