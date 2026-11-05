// マークダウンのページの印刷: 印刷区画の数と切る位置は、描いて測ってから決める（view/MarkdownPrint.tsx。切る位置の計算はここの cutSheets。
// 原文が空ならブロックが無く、印刷区画も無い）
import type { MarkdownBlock } from "../../base"
import { drawsImage } from "./link-target"

// ページの原文（無ければ空）
export const pageText = (page: object | null | undefined): string =>
  page && "text" in page && typeof page.text === "string" ? page.text : ""

// 測った文書のブロック 1 つ: 流し込む枠の中身の上端からの位置 top・bottom（px）と種類（見出しは次のブロックと離さない。画像は行で分けず、
// 残りに半分以上入れば縮めて入れる）、行の途中で切ってよい所 breaks（ブロックの中の行の下端。上から順。段落・リスト・表・コードなど）、
// 原文の中の始まりの位置 from
export interface MeasuredBlock {
  top: number
  bottom: number
  kind: "heading" | "image" | "other"
  breaks: readonly number[]
  from: number
}

// 印刷区画 1 つに入れる所: 中身の start から end まで（px）と、その頭のブロックの原文の中の位置 from
export interface SheetCut {
  start: number
  end: number
  from: number
}

// 縮める画像: 何番目のブロックを、高さ height（px）までに縮めるか
export interface ImageShrink {
  block: number
  height: number
}

// 画像の決まりで切るブロックか: 描く画像（link-target.ts の drawsImage）がちょうど 1 つで、ほかは空白と改行だけの段落。
// 画像が 2 つ以上の段落は、行で分ける物として、画像と画像の間で切る
export function isImageBlock(block: MarkdownBlock): boolean {
  if (block.kind !== "paragraph") return false
  const images = block.children.filter(c => c.kind === "image" && drawsImage(c.url))
  const rest = block.children.filter(c => !(c.kind === "image" && drawsImage(c.url)))
  return images.length === 1 && rest.every(c => c.kind === "break" || (c.kind === "text" && c.value.trim() === ""))
}

// ブロックの中で、行の途中で切ってよい所: 中の四角（字の行や、中の要素の箱。ブロックの上端からでなく、同じ座標）のどれにもまたがれていない、
// 四角の下端（切り上げて px）。ブロックの下端 bottom より上の物だけ（上から順）
export function lineBreaks(rects: readonly { top: number; bottom: number }[], bottom: number): number[] {
  const ends = new Set(rects.map(r => Math.ceil(r.bottom)).filter(y => y < bottom - 1))
  // 切り上げで隣の行に 1px 未満入るのは、またがれているとみない
  return [...ends].filter(y => rects.every(r => !(r.top < y - 1 && r.bottom > y + 1))).sort((a, b) => a - b)
}

// 測ったブロック blocks を、高さ height の枠ごとに切る。
// - 入る所まで並べ、入らないブロックから次の枠にする（次の枠は、そのブロックの上端から。前のブロックとの間の空きは持ち越さない）。
// - 入らないブロックに、今の枠に入る切ってよい所があれば、入る一番下の所で切り、続きを次の枠の頭にする。
// - 見出しは枠の一番下に残さず、次のブロックと一緒に次の枠へ送る（枠の頭の見出しは送らない）。
// - 入らない画像は、残りの高さに画像の半分以上が入るなら残りの高さまで縮め、入らなければ次の枠へ送る。枠より高い画像は枠の高さまで縮める。
// 縮めた画像は縮めた高さで置き、後ろのブロックをその分だけ上げて最後まで切る（shrinks は、何番目のブロックを何 px の高さにしたか。
// 呼ぶ側は縮めてから測り直して確かめる）
export function cutSheets(
  measured: readonly MeasuredBlock[],
  height: number,
): { cuts: SheetCut[]; shrinks: ImageShrink[] } {
  const blocks = measured.map(b => ({ ...b, breaks: [...b.breaks] }))
  const cuts: SheetCut[] = []
  const shrinks: ImageShrink[] = []
  const first = blocks[0]
  if (!first) return { cuts, shrinks }
  // ブロック i を高さ to に縮め、後ろのブロックをその分だけ上げる
  const shrink = (i: number, to: number) => {
    const b = blocks[i] as MeasuredBlock
    const by = b.bottom - b.top - to
    shrinks.push({ block: i, height: to })
    b.bottom = b.top + to
    for (const later of blocks.slice(i + 1)) {
      later.top -= by
      later.bottom -= by
      later.breaks = later.breaks.map(p => p - by)
    }
  }
  let start = first.top // 今の枠の頭の位置
  let head = 0 // 今の枠の頭のブロック
  let i = 0
  const close = (end: number, next: number, nextStart: number) => {
    cuts.push({ start, end, from: (blocks[head] as MeasuredBlock).from })
    head = next
    start = nextStart
  }
  while (i < blocks.length) {
    const b = blocks[i] as MeasuredBlock
    const limit = start + height
    if (b.bottom <= limit) {
      i++
      continue
    }
    const fresh = b.top <= start // 枠の頭のブロック（行の途中から続くブロックも）
    if (b.kind === "image") {
      const tall = b.bottom - b.top
      if (tall > height) {
        // 枠より高い画像: 枠の頭に置いて、枠の高さまで縮める
        if (!fresh) close((blocks[i - 1] as MeasuredBlock).bottom, i, b.top)
        shrink(i, height)
        continue
      }
      const room = limit - b.top
      if (!fresh && room * 2 >= tall) {
        shrink(i, room)
        continue
      }
    }
    const fit = b.breaks.filter(p => p > Math.max(start, b.top) && p <= limit).at(-1)
    if (b.kind !== "image" && fit !== undefined) {
      // 行の途中で切り、続きを次の枠の頭にする
      close(fit, i, fit)
      continue
    }
    if (fresh) {
      // 枠の頭でも入らない（切ってよい所が無い）: そのまま 1 つ置いて、はみ出した所は切れる
      close(b.bottom, i + 1, (blocks[i + 1] as MeasuredBlock | undefined)?.top ?? b.bottom)
      i++
      continue
    }
    let next = i
    while (next - 1 > head && blocks[next - 1]?.kind === "heading") next--
    close((blocks[next - 1] as MeasuredBlock).bottom, next, (blocks[next] as MeasuredBlock).top)
    i = next
  }
  const last = blocks[blocks.length - 1] as MeasuredBlock
  if (start < last.bottom) cuts.push({ start, end: last.bottom, from: (blocks[head] as MeasuredBlock).from })
  return { cuts, shrinks }
}
