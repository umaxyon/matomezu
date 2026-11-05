// マークダウンの印刷: 測るだけのビュー（ブックのビューの定義の printMeasure）と、印刷区画 1 つのビュー（printSheet）。
// 測るだけのビューは、文書を紙の幅で見えない所に描き、いちばん外のブロックの上端と下端を測って、紙の中身の高さ（紙の高さ − 上下の余白。
// 余白はテーマキー markdown-page-padding）ごとに切る（print.ts の cutSheets）。切った所の並びを知らせ、印刷区画 1 つのビューが受け取って、
// その所だけを描く。長い段落・リスト・表・コードは行の途中で切り、紙の幅に入らないブロックは幅に合わせて縮め、入らない画像は残りの高さまで
// 縮めるか次の紙へ送る（print.ts の cutSheets）。測り直すのは、文書か紙が替わったときと、描いた文書の大きさが変わったとき（テーマ・字体・画像の
// 読み込みで）だけ（同じ結果なら印刷プレビューは並べ直さない）
import { memo, useLayoutEffect, useMemo, useRef } from "react"
import { type MarkdownDocument, parseMarkdown } from "../../../base"
import type { PrintMeasureProps, PrintSheetProps } from "../../../base/ui"
import { cutSheets, type MeasuredBlock, pageText, type SheetCut } from "../print"
import { MarkdownDocumentView } from "./MarkdownDocumentView"
import styles from "./MarkdownView.module.css"

// 測るだけのビューが知らせ、印刷区画 1 つのビューが受け取るデータ: 印刷区画ごとの切った所と、上の余白（px）、
// 縮めたブロック（何番目のブロックの画像を何 px の高さまで・紙の幅に入らないブロックを何倍に）
interface MarkdownMeasured {
  cuts: readonly SheetCut[]
  top: number
  shrinks: readonly (readonly [number, number])[]
  zooms: readonly (readonly [number, number])[]
}

// いちばん外のブロックの要素（data-markdown-block の印の順。文書のブロックの順に当たる）
const blockElements = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>("[data-markdown-block]")]

// 描いた文書 el の縮め: 紙の幅に入らないブロックを幅に合わせて縮め（zooms）、画像を高さまで縮める（shrinks）。前の縮めは消してからかける
function applyShrinks(el: HTMLElement, zooms: ReadonlyMap<number, number>, shrinks: ReadonlyMap<number, number>) {
  for (const [i, b] of blockElements(el).entries()) {
    b.style.zoom = zooms.has(i) ? String(zooms.get(i)) : ""
    for (const img of b.querySelectorAll("img")) img.style.maxHeight = shrinks.has(i) ? `${shrinks.get(i)}px` : ""
  }
}

// 紙の幅に入らないブロックの縮める倍率（中身の幅に入る倍率）
function wideZooms(el: HTMLElement): Map<number, number> {
  const zooms = new Map<number, number>()
  for (const [i, b] of blockElements(el).entries()) {
    const wide = Math.max(b.scrollWidth, ...[...b.children].map(c => (c as HTMLElement).scrollWidth))
    if (wide > b.clientWidth + 1) zooms.set(i, b.clientWidth / wide)
  }
  return zooms
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

// 文書を描いた article el の中で、ブロックを測る（いちばん外のブロックは data-markdown-block の印の順に文書のブロックに当たり、脚注は最後に 1 つ）。
// 位置は article の中身の上端（上の余白 top の下）から。行の途中で切ってよい所は、表は行の下端、ほかは字の行の下端（Range の行の四角）
function measureBlocks(el: HTMLElement, document: MarkdownDocument, top: number, end: number): MeasuredBlock[] {
  const base = el.getBoundingClientRect().top + top
  const at = (b: HTMLElement) => b.getBoundingClientRect().top - base
  const breaksOf = (b: HTMLElement, bottom: number): number[] => {
    const rows = b.querySelectorAll("tr")
    const rects =
      rows.length > 0
        ? [...rows].map(r => r.getBoundingClientRect())
        : (() => {
            const range = window.document.createRange()
            range.selectNodeContents(b)
            return [...range.getClientRects()]
          })()
    const ends = new Set(rects.map(r => Math.round(r.bottom - base)).filter(y => y < bottom - 1))
    return [...ends].sort((a, b) => a - b)
  }
  const blocks: MeasuredBlock[] = blockElements(el).map((b, i) => {
    const y = at(b)
    const bottom = y + b.getBoundingClientRect().height
    const image = b.querySelector("img") !== null && (b.textContent ?? "").trim() === ""
    const kind = document.blocks[i]?.kind === "heading" ? "heading" : image ? "image" : "other"
    return {
      top: y,
      bottom,
      kind,
      breaks: kind === "other" ? breaksOf(b, bottom) : [],
      from: document.blocks[i]?.range.start ?? end,
    }
  })
  const notes = el.querySelector<HTMLElement>("[data-markdown-document] > section")
  if (notes) {
    const y = at(notes)
    const bottom = y + notes.getBoundingClientRect().height
    blocks.push({ top: y, bottom, kind: "other", breaks: breaksOf(notes, bottom), from: end })
  }
  return blocks
}

const SHRINK_ROUNDS = 5 // 画像を縮めて測り直す回数の上限（縮めた画像は次には入るので、たいてい 1・2 回で済む）

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
      // 幅に入らないブロックを縮めてから、切っては画像を縮めて測り直す
      applyShrinks(el, new Map(), new Map())
      const zooms = wideZooms(el)
      const shrinks = new Map<number, number>()
      applyShrinks(el, zooms, shrinks)
      let cut = cutSheets(measureBlocks(el, document, top, text.length), paper.h - top - bottom)
      for (let round = 0; round < SHRINK_ROUNDS && cut.shrinks.length > 0; round++) {
        for (const s of cut.shrinks) shrinks.set(s.block, s.height)
        applyShrinks(el, zooms, shrinks)
        cut = cutSheets(measureBlocks(el, document, top, text.length), paper.h - top - bottom)
      }
      const data: MarkdownMeasured = { cuts: cut.cuts, top, shrinks: [...shrinks], zooms: [...zooms] }
      latest.current({ rows: cut.cuts.length, data })
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
  // 測ったときと同じ縮めをかける（でないと、切った所と描いた位置がずれる）
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (ref.current && data) applyShrinks(ref.current, new Map(data.zooms), new Map(data.shrinks))
  })
  if (!data || !cut) return null
  // 印刷区画 row の所: 上の余白の下から、切った所の高さだけを見せ、その中に文書を切った所の上端が来るようにずらして描く
  return (
    <div
      className={styles.sheetClip}
      data-markdown-from={cut.from}
      style={{ top: row * paper.h + data.top, width: paper.w, height: cut.end - cut.start }}
    >
      <article
        ref={ref}
        className={`${styles.document} ${styles.printed}`}
        style={{ width: paper.w, top: -cut.start - data.top }}
      >
        <MarkdownDocumentView document={document} />
      </article>
    </div>
  )
}
