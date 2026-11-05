// マークダウンのページの印刷: 原文が空なら何も載っていない（印刷プレビューに並べない）。印刷区画の数と切る位置は、描いて測ってから決める
// （view/MarkdownPrint.tsx。切る位置の計算はここの cutSheets）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import type { PrintSheets } from "../../base"

// ページの原文（無ければ空）
export const pageText = (page: object | null | undefined): string =>
  page && "text" in page && typeof page.text === "string" ? page.text : ""

// 見せ方の printSheets: 数は測るまで 1 つ。原文が空なら何も載っていない
export function markdownPrintSheets(_catalog: CoreCatalog, page: ItemPage): PrintSheets {
  return { columns: 1, rows: 1, filled: new Set(pageText(page).trim() === "" ? [] : ["0,0"]) }
}

// 測った文書のブロック 1 つ: 流し込む枠の中身の上端からの位置 top・bottom（px）と種類（見出しは次のブロックと離さない）、
// 原文の中の始まりの位置 from
export interface MeasuredBlock {
  top: number
  bottom: number
  kind: "heading" | "other"
  from: number
}

// 印刷区画 1 つに入れる所: 中身の start から end まで（px）と、その頭のブロックの原文の中の位置 from
export interface SheetCut {
  start: number
  end: number
  from: number
}

// 測ったブロック blocks を、高さ height の枠ごとに切る: 入る所まで並べ、入らないブロックから次の枠にする（次の枠は、そのブロックの上端から。
// 前のブロックとの間の空きは持ち越さない）。見出しは枠の一番下に残さず、次のブロックと一緒に次の枠へ送る。枠より高いブロックは、
// 枠 1 つに 1 つだけ置く（はみ出した所は切れる）
export function cutSheets(blocks: readonly MeasuredBlock[], height: number): SheetCut[] {
  const first = blocks[0]
  if (!first) return []
  const cuts: SheetCut[] = []
  let from = 0 // 今の枠の頭のブロック
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i] as MeasuredBlock
    const head = blocks[from] as MeasuredBlock
    if (b.bottom - head.top <= height) continue
    // 入らないブロック i から次の枠。その前が見出しなら、見出しごと送る（枠の頭まで見出しなら送らない）
    let next = i
    while (next - 1 > from && blocks[next - 1]?.kind === "heading") next--
    cuts.push({ start: head.top, end: (blocks[next - 1] as MeasuredBlock).bottom, from: head.from })
    from = next
    i = next
  }
  const head = blocks[from] as MeasuredBlock
  cuts.push({ start: head.top, end: (blocks[blocks.length - 1] as MeasuredBlock).bottom, from: head.from })
  return cuts
}
