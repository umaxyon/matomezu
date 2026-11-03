// ソースのペインのスクロールに、描いた文書のペインを付いて行かせる位置: 同じブロック（原文の中の始まりの位置が同じ物）の上端どうしを組にして、組の間は割合で結ぶ。
// 組は、両方のペインの上端（0 と 0）と、両方にあるブロックの上端と、両方のいちばん下までスクロールした所。いちばん下より先のブロックと、上へ戻る組は飛ばす
export type PaneMarks = {
  blocks: ReadonlyMap<number, number> // ブロックの原文の中の始まりの位置 → ペインの中の上端の縦の位置
  end: number // いちばん下までスクロールしたときのスクロールの量
}

type Pair = { source: number; rendered: number }

export function followScroll(source: PaneMarks, rendered: PaneMarks, sourceTop: number): number {
  const ends = { source: source.end, rendered: rendered.end }
  const both: Pair[] = []
  for (const [start, top] of source.blocks) {
    const other = rendered.blocks.get(start)
    if (other !== undefined && top < ends.source && other < ends.rendered) both.push({ source: top, rendered: other })
  }
  const pairs: Pair[] = [{ source: 0, rendered: 0 }]
  for (const p of [...both.sort((x, y) => x.source - y.source), ends]) {
    const last = pairs[pairs.length - 1]
    if (last && p.source > last.source && p.rendered >= last.rendered) pairs.push(p)
  }
  let a: Pair = { source: 0, rendered: 0 }
  for (const b of pairs) {
    if (sourceTop <= b.source)
      return b.source === a.source
        ? b.rendered
        : a.rendered + ((sourceTop - a.source) / (b.source - a.source)) * (b.rendered - a.rendered)
    a = b
  }
  return a.rendered
}

// ソースのペインの原文を、ブロックの始まりの位置 starts で切った物（どれも、原文の中の始まりの位置を持つ。最初の物は 0 から）。
// ソースのペインが、ブロックごとの上端を測るのに使う
export function sourcePieces(text: string, starts: readonly number[]): { start: number; text: string }[] {
  const cuts = [...new Set([0, ...starts.filter(s => s > 0 && s < text.length)])].sort((a, b) => a - b)
  return cuts.map((start, i) => ({ start, text: text.slice(start, cuts[i + 1] ?? text.length) }))
}
