// マークダウンの印刷: 測るだけのビュー（ブックのビューの定義の printMeasure）と、印刷区画 1 つのビュー（printSheet）。
// 測るだけのビューは、文書を紙の幅で見えない所に描き、いちばん外のブロックの上端と下端を測って、紙の中身の高さ（紙の高さ − 上下の余白。
// 余白はテーマキー markdown-page-padding）ごとに切る（print.ts の cutSheets）。切った所の並びを知らせ、印刷区画 1 つのビューが受け取って、
// その所だけを描く。描き直すたびと、字体を読み込み終えたときに測り直す（同じ結果なら印刷プレビューは並べ直さない）
import { useLayoutEffect, useMemo, useRef } from "react"
import { type MarkdownDocument, parseMarkdown } from "../../../base"
import type { PrintMeasureProps, PrintSheetProps } from "../../../base/ui"
import { cutSheets, type MeasuredBlock, pageText, type SheetCut } from "../print"
import { MarkdownDocumentView } from "./MarkdownDocumentView"
import styles from "./MarkdownView.module.css"

// 測るだけのビューが知らせ、印刷区画 1 つのビューが受け取るデータ: 印刷区画ごとの切った所と、上の余白（px）
interface Measured {
  cuts: readonly SheetCut[]
  top: number
}

// ページの原文を読んだ物（ページごとに、最後に読んだ原文と一緒に覚え、同じ原文なら読み直さない。測るビューと印刷区画のビューで使い回す）
const read = new Map<string, { text: string; document: MarkdownDocument }>()
function documentOf(page: string, text: string): MarkdownDocument {
  const was = read.get(page)
  if (was?.text === text) return was.document
  const document = parseMarkdown(text)
  read.set(page, { text, document })
  return document
}

const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"])

export function MarkdownMeasure({ page, paper, report }: PrintMeasureProps) {
  const text = pageText(page)
  const document = useMemo(() => documentOf(page.id, text), [page.id, text])
  const ref = useRef<HTMLElement>(null)
  const latest = useRef(report)
  latest.current = report
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current
      if (!el) return
      const style = getComputedStyle(el)
      const top = Number.parseFloat(style.paddingTop) || 0
      const bottom = Number.parseFloat(style.paddingBottom) || 0
      const body = el.querySelector("[data-markdown-document]")
      const blocks: MeasuredBlock[] = [...(body?.children ?? [])].map((b, i) => {
        const at = (b as HTMLElement).offsetTop - top
        return {
          top: at,
          bottom: at + (b as HTMLElement).offsetHeight,
          kind: HEADINGS.has(b.tagName) ? "heading" : "other",
          from: document.blocks[i]?.range.start ?? text.length,
        }
      })
      const cuts = text.trim() === "" ? [] : cutSheets(blocks, paper.h - top - bottom)
      latest.current({ rows: cuts.length, data: { cuts, top } satisfies Measured })
    }
    measure()
    // 字体を読み込み終えたら、字の幅と高さが変わるので測り直す
    let live = true
    void window.document.fonts?.ready.then(() => live && measure())
    return () => {
      live = false
    }
  })
  return (
    <article ref={ref} className={`${styles.document} ${styles.printed}`} style={{ width: paper.w }}>
      <MarkdownDocumentView document={document} />
    </article>
  )
}

export function MarkdownSheet({ page, row, paper, measured }: PrintSheetProps) {
  const text = pageText(page)
  const document = useMemo(() => documentOf(page.id, text), [page.id, text])
  const data = measured as Measured | undefined
  const cut = data?.cuts[row]
  if (!data || !cut) return null
  // 印刷区画 row の所: 上の余白の下から、切った所の高さだけを見せ、その中に文書を切った所の上端が来るようにずらして描く
  return (
    <div
      className={styles.sheetClip}
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
