// 検索の当たり（原文の [start, end)）から、描いた要素の上の Range を作る（base の検索が光らせる。base/search/highlights.tsx）。
// ソースのペインは、見えない写しの行（data-line-start に行の頭の位置）の中の字を数えて引く。
// 描いた文書は、原文と同じ字の並びの文中の字（data-markdown-at に原文の頭の位置）を引き、引けない当たり（記号・エスケープ・コードの塊など）はいちばん外のブロックごと光らせる
import type { MarkdownBlock } from "../../../base"

type Spot = { node: Node; offset: number }

// 写しの中の、原文の位置 at の所
function mirrorSpot(lines: readonly HTMLElement[], at: number): Spot | null {
  let line: HTMLElement | undefined
  for (const l of lines) {
    if (Number(l.dataset.lineStart) <= at) line = l
    else break
  }
  if (!line) return null
  let left = at - Number(line.dataset.lineStart)
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.data === "​") continue
    if (left <= n.data.length) return { node: n, offset: left }
    left -= n.data.length
    last = n
  }
  return last ? { node: last, offset: last.data.length } : { node: line, offset: 0 }
}

// ソースのペインの写し mirror の上の、当たり hits の Range
export function mirrorRanges(mirror: HTMLElement | null, hits: readonly { start: number; end: number }[]): Range[] {
  if (!mirror || hits.length === 0) return []
  const lines = [...mirror.querySelectorAll<HTMLElement>("[data-line-start]")]
  return hits.flatMap(hit => {
    const [from, to] = [mirrorSpot(lines, hit.start), mirrorSpot(lines, hit.end)]
    if (!from || !to) return []
    const range = document.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    return [range]
  })
}

// 描いた文書 root の上の、当たり hits の Range（blocks は描いた文書のいちばん外のブロック。並びの順に data-markdown-block の要素に当たる）
export function renderedRanges(
  root: HTMLElement | null,
  blocks: readonly MarkdownBlock[],
  hits: readonly { start: number; end: number }[],
): Range[] {
  if (!root || hits.length === 0) return []
  const tops = [...root.querySelectorAll<HTMLElement>("[data-markdown-block]")]
  // 中身が同じブロックは描き直さないので、data-markdown-at と data-markdown-block は描いたときの位置のまま。今のブロックの頭との差で直す
  const texts = tops.flatMap((top, i) => {
    const shift = (blocks[i]?.range.start ?? 0) - Number(top.dataset.markdownBlock)
    return [...top.querySelectorAll<HTMLElement>("[data-markdown-at]")].map(el => ({
      el,
      start: Number(el.dataset.markdownAt) + shift,
      length: el.textContent?.length ?? 0,
    }))
  })
  return hits.flatMap(hit => {
    const inText = texts.flatMap(t => {
      const [from, to] = [Math.max(hit.start, t.start), Math.min(hit.end, t.start + t.length)]
      const node = t.el.firstChild
      if (from >= to || !node) return []
      const range = document.createRange()
      range.setStart(node, from - t.start)
      range.setEnd(node, to - t.start)
      return [range]
    })
    if (inText.length > 0) return inText
    const i = blocks.findIndex(b => b.range.start <= hit.start && hit.start < b.range.end)
    const el = i >= 0 ? tops[i] : undefined
    if (!el) return []
    const range = document.createRange()
    range.selectNodeContents(el)
    return [range]
  })
}

// スクロールするペイン pane の中で、range が見えるように縦にスクロールする（見えていれば動かさない。上下に少し余白を残す）
export function scrollToRange(pane: HTMLElement | null, range: Range | undefined): void {
  if (!pane || !range) return
  const box = pane.getBoundingClientRect()
  const r = range.getBoundingClientRect()
  const margin = 32
  if (r.top < box.top + margin) pane.scrollTop -= box.top + margin - r.top
  else if (r.bottom > box.bottom - margin) pane.scrollTop += r.bottom - (box.bottom - margin)
}
