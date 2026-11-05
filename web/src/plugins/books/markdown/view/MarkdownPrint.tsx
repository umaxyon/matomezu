// マークダウンの印刷: 測るだけのビュー（ブックのビューの定義の printMeasure）と、印刷区画 1 つのビュー（printSheet）。
// 測るだけのビューは、文書を紙の幅で見えない所に描き、いちばん外のブロックの上端と下端を測って、紙の中身の高さ（紙の高さ − 上下の余白。
// 余白はテーマキー markdown-page-padding）ごとに切る（print.ts の cutSheets）。切った所の並びを知らせ、印刷区画 1 つのビューが受け取って、
// その所だけを描く。測り直すのは、文書か紙が替わったときと、描いた文書の大きさが変わったとき（テーマ・字体の読み込みで）だけ
// （同じ結果なら印刷プレビューは並べ直さない）
import { memo, useLayoutEffect, useMemo, useRef } from "react"
import { type MarkdownDocument, parseMarkdown } from "../../../base"
import type { PrintMeasureProps, PrintSheetProps } from "../../../base/ui"
import { cutSheets, type MeasuredBlock, pageText, type SheetCut } from "../print"
import { MarkdownDocumentView } from "./MarkdownDocumentView"
import styles from "./MarkdownView.module.css"

// 測るだけのビューが知らせ、印刷区画 1 つのビューが受け取るデータ: 印刷区画ごとの切った所と、上の余白（px）
interface MarkdownMeasured {
  cuts: readonly SheetCut[]
  top: number
}

// ページの原文を読んだ物: ブックとページごとに、最後に読んだ原文と一緒に 1 つだけ覚え、同じ原文なら読み直さない（測るビューと、
// ページの印刷区画の数だけある印刷区画のビューで、同じ物を使い回すため。base の useMarkdownDocument はビューごとに読む）。
// 印刷するページの分だけ覚え、消さない
const parsedPages = new Map<string, { text: string; document: MarkdownDocument }>()
function documentOf(book: string, page: string, text: string): MarkdownDocument {
  const key = `${book}\n${page}`
  const was = parsedPages.get(key)
  if (was?.text === text) return was.document
  const document = parseMarkdown(text)
  parsedPages.set(key, { text, document })
  return document
}

// 文書を描いた article の中で、ブロックを測る（いちばん外のブロックは data-markdown-block の印の順に文書のブロックに当たり、脚注は最後に 1 つ）
function measureBlocks(el: HTMLElement, document: MarkdownDocument, top: number, end: number): MeasuredBlock[] {
  const at = (b: HTMLElement) => b.offsetTop - top
  const blocks: MeasuredBlock[] = [...el.querySelectorAll<HTMLElement>("[data-markdown-block]")].map((b, i) => ({
    top: at(b),
    bottom: at(b) + b.offsetHeight,
    kind: document.blocks[i]?.kind === "heading" ? "heading" : "other",
    from: document.blocks[i]?.range.start ?? end,
  }))
  const notes = el.querySelector<HTMLElement>("[data-markdown-document] > section")
  if (notes) blocks.push({ top: at(notes), bottom: at(notes) + notes.offsetHeight, kind: "other", from: end })
  return blocks
}

export const MarkdownMeasure = memo(function MarkdownMeasure({ book, page, paper, report }: PrintMeasureProps) {
  const text = pageText(page)
  const document = useMemo(() => documentOf(book.id, page.id, text), [book.id, page.id, text])
  const ref = useRef<HTMLElement>(null)
  const latest = useRef(report)
  latest.current = report
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const style = getComputedStyle(el)
      const top = Number.parseFloat(style.paddingTop) || 0
      const bottom = Number.parseFloat(style.paddingBottom) || 0
      const cuts = cutSheets(measureBlocks(el, document, top, text.length), paper.h - top - bottom)
      latest.current({ rows: cuts.length, data: { cuts, top } satisfies MarkdownMeasured })
    }
    measure()
    // テーマや字体の読み込みで描いた文書の大きさが変わったら、測り直す
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [document, text.length, paper.h])
  return (
    <article ref={ref} className={`${styles.document} ${styles.printed}`} style={{ width: paper.w }}>
      <MarkdownDocumentView document={document} />
    </article>
  )
})

export function MarkdownSheet({ book, page, row, paper, measured }: PrintSheetProps) {
  const text = pageText(page)
  const document = useMemo(() => documentOf(book.id, page.id, text), [book.id, page.id, text])
  const data = measured as MarkdownMeasured | undefined
  const cut = data?.cuts[row]
  if (!data || !cut) return null
  // 印刷区画 row の所: 上の余白の下から、切った所の高さだけを見せ、その中に文書を切った所の上端が来るようにずらして描く
  return (
    <div
      className={styles.sheetClip}
      data-markdown-from={cut.from}
      style={{ top: row * paper.h + data.top, width: paper.w, height: cut.end - cut.start }}
    >
      <article
        className={`${styles.document} ${styles.printed}`}
        style={{ width: paper.w, top: -cut.start - data.top }}
      >
        <MarkdownDocumentView document={document} />
      </article>
    </div>
  )
}
