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

// ソースのペインの原文の 1 行（改行から改行まで。番号 n は 1 から）: 始まりの位置 start と、ブロックの始まり（starts）の所で切った字の並び pieces
// （どれも、原文の中の始まりの位置を持ち、ブロックの始まりの物は block）。ソースのペインが、行ごとに写しを描き、ブロックごとの上端を測るのに使う
export interface SourceLine {
  n: number
  start: number
  pieces: { start: number; text: string; block: boolean }[]
}

export function sourceLines(text: string, starts: readonly number[]): SourceLine[] {
  const blocks = new Set([0, ...starts.filter(s => s > 0 && s < text.length)])
  const lines: SourceLine[] = []
  let start = 0
  for (const [i, line] of text.split("\n").entries()) {
    const end = start + line.length
    const cuts = [...new Set([start, ...[...blocks].filter(b => b > start && b < end)])].sort((a, b) => a - b)
    const pieces = cuts.map((at, j) => ({ start: at, text: text.slice(at, cuts[j + 1] ?? end), block: blocks.has(at) }))
    lines.push({ n: i + 1, start, pieces })
    start = end + 1
  }
  return lines
}

// 空白の印の種類: 半角スペース・全角スペース・Tab
export type Blank = "space" | "wide" | "tab"
const BLANKS: Readonly<Record<string, Blank>> = { " ": "space", "\u3000": "wide", "\t": "tab" }

// 字の並び text を、空白でない字の続きと、空白 1 字ずつに分ける（空白の印を重ねて描くのに使う）
export function blankRuns(text: string): { text: string; blank: Blank | null }[] {
  const runs: { text: string; blank: Blank | null }[] = []
  for (const ch of text) {
    const blank = BLANKS[ch] ?? null
    const last = runs[runs.length - 1]
    if (blank === null && last && last.blank === null) last.text += ch
    else runs.push({ text: ch, blank })
  }
  return runs
}
