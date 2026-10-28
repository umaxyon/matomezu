// 本文の装飾: 本文の文字列の中に書く Markdown の一部。**太字** と、{色:文字}（色は文字の色の id。base の色は名前だけで書ける: {warn:注意}）。
// 対にならない記号・閉じていない記号は、ただの文字。色の id が機能台帳に無くても記号は外し、色を付けずに描く（プラグインを外しても文字は読める）。
// 色の中に色は入れられない（中の { はただの文字）。太字と色は重ねられる。記号は段落（改行まで）の中でだけ対にする。
// 太字の字は太字の幅で測って折り返す（text.ts）。HTML としては描かず、描く側が区切り（Run）ごとに文字として描く
import { splitId } from "../../../core/names"
import { kit } from "../kit"
import { breakParagraph, charWidth, ELLIPSIS, type Font, SLACK } from "./text"

// 同じ装飾の続き。color は文字の色の id（無ければ null）
export interface Run {
  text: string
  bold: boolean
  color: string | null
}
export type RichLine = readonly Run[]

// 本文に書いた色の名前を、文字の色の id にする（頭の無い名前は base の色）
export const textColorId = (ref: string): string => (ref.startsWith("@") ? ref : kit.name(ref))
// 文字の色の id を、本文に書く名前にする（base の色は名前だけ）
export const textColorRef = (id: string): string => {
  const { name } = splitId(id)
  return kit.name(name) === id ? name : id
}

const COLOR_OPEN = /^\{((?:@[a-z0-9-]+\/[a-z0-9-]+:)?[a-z][a-z0-9-]*):/

// 段落の字ごとの装飾
interface Styled {
  chars: string[]
  bold: boolean[]
  color: (string | null)[]
}

interface Mark {
  at: number // 字の位置
  len: number // 記号の字数
  kind: "bold" | "open" | "close"
  color?: string
}

function parseParagraph(text: string): Styled {
  const src = [...text]
  const marks: Mark[] = []
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === "*" && src[i + 1] === "*") {
      marks.push({ at: i, len: 2, kind: "bold" })
      i++
    } else if (ch === "{") {
      const m = COLOR_OPEN.exec(src.slice(i, i + 80).join(""))
      if (m) {
        marks.push({ at: i, len: m[0].length, kind: "open", color: textColorId(m[1] as string) })
        i += m[0].length - 1
      }
    } else if (ch === "}") marks.push({ at: i, len: 1, kind: "close" })
  }
  // 対になる記号だけを残す: 太字は前から 2 つずつ、色は開いたあとの最初の閉じ
  const kept = new Set<Mark>()
  const bolds = marks.filter(m => m.kind === "bold")
  for (let i = 0; i + 1 < bolds.length; i += 2) {
    kept.add(bolds[i] as Mark)
    kept.add(bolds[i + 1] as Mark)
  }
  let open: Mark | null = null
  for (const m of marks) {
    if (m.kind === "open" && !open) open = m
    else if (m.kind === "close" && open) {
      kept.add(open)
      kept.add(m)
      open = null
    }
  }
  const out: Styled = { chars: [], bold: [], color: [] }
  const byAt = new Map([...kept].map(m => [m.at, m]))
  let bold = false
  let color: string | null = null
  for (let i = 0; i < src.length; i++) {
    const m = byAt.get(i)
    if (m) {
      if (m.kind === "bold") bold = !bold
      else color = m.kind === "open" ? (m.color ?? null) : null
      i += m.len - 1
      continue
    }
    out.chars.push(src[i] as string)
    out.bold.push(bold)
    out.color.push(color)
  }
  return out
}

// 字の範囲を、同じ装飾の続きに分ける
function runsOf(s: Styled, from: number, to: number): Run[] {
  const runs: Run[] = []
  for (let i = from; i < to; i++) {
    const last = runs.at(-1)
    const bold = s.bold[i] as boolean
    const color = s.color[i] ?? null
    if (last && last.bold === bold && last.color === color) last.text += s.chars[i]
    else runs.push({ text: s.chars[i] as string, bold, color })
  }
  return runs
}

const fontOf = (font: Font, bold: boolean): Font => (bold ? { ...font, weight: 700 } : font)

// 本文を、装飾の区切りの並びにする（折り返さない。改行ごとに 1 行）
export function parseRich(text: string): RichLine[] {
  return text.split("\n").map(p => {
    const s = parseParagraph(p)
    return runsOf(s, 0, s.chars.length)
  })
}

// 本文を幅 width（px）の行に分ける（太字は太字の幅で測る。改行はそのまま行を分ける）
export function wrapRich(text: string, width: number, font: Font): RichLine[] {
  return text.split("\n").flatMap(p => {
    const s = parseParagraph(p)
    const widths = s.chars.map((ch, i) => charWidth(ch, fontOf(font, s.bold[i] as boolean)))
    return breakParagraph(s.chars, widths, width).map(([a, b]) => runsOf(s, a, b))
  })
}

const runWidth = (r: Run, font: Font) => [...r.text].reduce((w, ch) => w + charWidth(ch, fontOf(font, r.bold)), 0)

// 1 行の幅（px。太字は太字の幅）
export const richWidth = (line: RichLine, font: Font) => line.reduce((w, r) => w + runWidth(r, font), 0)

// 行を max 行までにする。超えたら最後の行を、… を足して幅 width に収まるまで縮める（… は最後に残った字の装飾）
export function clampRich(lines: readonly RichLine[], max: number, width: number, font: Font): RichLine[] {
  if (lines.length <= max) return [...lines]
  const kept = lines.slice(0, max)
  const runs = (kept[max - 1] as RichLine).map(r => ({ ...r }))
  const styleOf = () => runs.at(-1) ?? { text: "", bold: false, color: null }
  const total = () => runs.reduce((w, r) => w + runWidth(r, font), 0)
  const ellipsis = () => charWidth(ELLIPSIS, fontOf(font, styleOf().bold))
  const pop = () => {
    const last = runs.at(-1)
    if (!last) return
    last.text = [...last.text].slice(0, -1).join("")
    if (last.text === "") runs.pop()
  }
  while (runs.length > 0 && total() + ellipsis() > width + SLACK) pop()
  while (runs.length > 0 && styleOf().text.endsWith(" ")) {
    const last = styleOf() as Run
    last.text = last.text.replace(/ +$/, "")
    if (last.text === "") runs.pop()
  }
  const last = styleOf()
  if (runs.length > 0) (runs.at(-1) as Run).text += ELLIPSIS
  else runs.push({ text: ELLIPSIS, bold: last.bold, color: last.color })
  kept[max - 1] = runs
  return kept
}

// 区切りの並びの文字だけ（記号を外したもの）
export const plainOf = (line: RichLine) => line.map(r => r.text).join("")
