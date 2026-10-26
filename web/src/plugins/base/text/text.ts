// 文字の幅と折り返し（OVERHAUL 4.12）: 幅はフォントのデータの表（noto-sans-jp.ts）を足し合わせて出し、ブラウザには測らせない。
// 折り返しもここで決め、画面は行ごとに分けて描く（ブラウザには折り返させない）。どこで計算しても同じ行になる

import { NOTO_SANS_JP } from "./noto-sans-jp"

export type Weight = 400 | 700

// 字の大きさ（px）と太さ
export interface Font {
  size: number
  weight: Weight
}

// 表に無い字の幅（1 em を 1000 にした値）。全角の範囲の字は 1 em、ほかは半分
const missing = (cp: number) => (cp >= 0x1100 ? 1000 : 500)

// 表を、二分探索できる形（並びの最初の字・最後の字・幅）に開いたもの。太さごとに初めて使うときに作る
const opened = new Map<Weight, { start: Int32Array; end: Int32Array; width: Int32Array }>()

function tableOf(weight: Weight) {
  const have = opened.get(weight)
  if (have) return have
  const runs = NOTO_SANS_JP[weight]
  const n = runs.length / 3
  const t = { start: new Int32Array(n), end: new Int32Array(n), width: new Int32Array(n) }
  for (let i = 0; i < n; i++) {
    t.start[i] = runs[i * 3] as number
    t.end[i] = (runs[i * 3] as number) + (runs[i * 3 + 1] as number) - 1
    t.width[i] = runs[i * 3 + 2] as number
  }
  opened.set(weight, t)
  return t
}

// 1 字の幅（1 em を 1000 にした値）
function units(cp: number, weight: Weight): number {
  const t = tableOf(weight)
  let lo = 0
  let hi = t.start.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cp < (t.start[mid] as number)) hi = mid - 1
    else if (cp > (t.end[mid] as number)) lo = mid + 1
    else return t.width[mid] as number
  }
  return missing(cp)
}

// 文字列の幅（px）
export function textWidth(text: string, font: Font): number {
  let sum = 0
  for (const ch of text) sum += units(ch.codePointAt(0) as number, font.weight)
  return (sum * font.size) / 1000
}

// 行の頭に置かない字（句読点・閉じ括弧・小書きの仮名・長音など）と、行の終わりに置かない字（開き括弧）
const NO_START = new Set(
  "、。，．・：；？！‼⁇⁈⁉ー～…‥〜」』）］｝〉》】〕〙〗”’゛゜ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻,.!?:;)]}%",
)
const NO_END = new Set("「『（［｛〈《【〔〘〖“‘([{")

// 折り返しの単位: 英数字の続き（語）は切らずに 1 つ、空白は 1 字ずつ、ほかの字（和文など）は 1 字ずつ
const WORD = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}'’\-_/@#$&*+=<>^`|~"]/u

function unitsOf(paragraph: string): string[] {
  const out: string[] = []
  let word = ""
  for (const ch of paragraph) {
    if (WORD.test(ch)) {
      word += ch
      continue
    }
    if (word) out.push(word)
    word = ""
    out.push(ch)
  }
  if (word) out.push(word)
  return out
}

// 単位の間で折り返してよいか（前の単位の終わりの字と、次の単位の頭の字で決める）
function canBreak(prev: string, next: string): boolean {
  const last = [...prev].at(-1) as string
  const first = [...next][0] as string
  return !NO_END.has(last) && !NO_START.has(first)
}

const trimEnd = (s: string) => s.replace(/ +$/, "")

// 幅を足し合わせたときの小数の誤差で、ちょうど収まる行をはみ出しにしないための遊び（px）
const SLACK = 0.001

// 1 段落を幅 width（px）の行に分ける。行の終わりの空白は数えずに落とし、折り返した行の頭の空白も落とす。
// 禁則に合う切れ目が無いか、禁則で次の行へ送ると次の行に収まらなければ、禁則を見ずに折る。1 行に収まらない語は字で切る
function wrapParagraph(paragraph: string, width: number, font: Font): string[] {
  const lines: string[] = []
  let line: string[] = [] // 今の行の単位
  let lineWidth = 0
  const breakAt = (at: number) => {
    lines.push(trimEnd(line.slice(0, at).join("")))
    line = line.slice(at)
    while (line[0] === " ") line.shift()
    lineWidth = textWidth(line.join(""), font)
  }
  const add = (unit: string, w: number) => {
    line.push(unit)
    lineWidth += w
  }
  for (const unit of unitsOf(paragraph)) {
    const w = textWidth(unit, font)
    if (unit === " ") {
      if (line.length > 0 || lines.length === 0) add(unit, w)
      continue
    }
    if (lineWidth + w <= width + SLACK) {
      add(unit, w)
      continue
    }
    if (line.length > 0) {
      let at = line.length
      while (at > 0 && !canBreak(line[at - 1] as string, at === line.length ? unit : (line[at] as string))) at--
      const carried = at > 0 ? textWidth(line.slice(at).join(""), font) : Infinity
      breakAt(at > 0 && carried + w <= width + SLACK ? at : line.length)
    }
    if (lineWidth + w <= width + SLACK || [...unit].length === 1) {
      add(unit, w)
      continue
    }
    for (const ch of unit) {
      const cw = textWidth(ch, font)
      if (lineWidth + cw > width + SLACK && line.length > 0) breakAt(line.length)
      add(ch, cw)
    }
  }
  lines.push(trimEnd(line.join("")))
  return lines
}

// 文を幅 width（px）の行に分ける。改行はそのまま行を分ける
export function wrap(text: string, width: number, font: Font): string[] {
  return text.split("\n").flatMap(p => wrapParagraph(p, width, font))
}

const ELLIPSIS = "…"

// 行を max 行までにする。超えたら最後の行を、… を足して幅 width に収まるまで縮める
export function clampLines(lines: readonly string[], max: number, width: number, font: Font): string[] {
  if (lines.length <= max) return [...lines]
  const kept = lines.slice(0, max)
  const chars = [...(kept[max - 1] as string)]
  while (chars.length > 0 && textWidth(chars.join("") + ELLIPSIS, font) > width + SLACK) chars.pop()
  kept[max - 1] = trimEnd(chars.join("")) + ELLIPSIS
  return kept
}
