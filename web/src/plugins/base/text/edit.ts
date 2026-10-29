// 本文の装飾を書き換える: 本文を字ごとの装飾の並びにし、平文の位置（記号を数えない字の位置。改行も 1 字）で字を書き足し・装飾を付け替え、
// 本文の文字列（rich.ts の記号の形）に戻す。見たまま編集する入力Form（RichInput）が使う
import { parseRich, type Run, stringifyRich } from "./rich"

// 字 1 つと、その装飾（color は文字の色の id。改行は装飾なし）
export interface StyledChar {
  ch: string
  bold: boolean
  color: string | null
}
export type Style = Omit<StyledChar, "ch">

// 付ける装飾: 太字、文字の色（文字の色の id）、色を外す
export type Decoration = { bold: true } | { color: string } | { color: null }

export const PLAIN: Style = { bold: false, color: null }

export function charsOf(text: string): StyledChar[] {
  return parseRich(text).flatMap((line, i) => [
    ...(i > 0 ? [{ ch: "\n", ...PLAIN }] : []),
    ...line.flatMap(r => [...r.text].map(ch => ({ ch, bold: r.bold, color: r.color }))),
  ])
}

export function textOf(chars: readonly StyledChar[]): string {
  const lines: Run[][] = [[]]
  for (const c of chars) {
    if (c.ch === "\n") lines.push([])
    else (lines.at(-1) as Run[]).push({ text: c.ch, bold: c.bold, color: c.color })
  }
  return stringifyRich(lines)
}

// 装飾を付けたあとの装飾: 太字は裏返し、色は同じ色か色なしなら外し、違う色なら替える
export function styled(base: Style, d: Decoration): Style {
  if ("bold" in d) return { ...base, bold: !base.bold }
  return { ...base, color: d.color === null || d.color === base.color ? null : d.color }
}

// 範囲 [start, end) の字に装飾を付ける。範囲の字が全部もう付いていれば外す（太字・同じ色）。違う色なら替える。改行には付けない
export function restyle(chars: readonly StyledChar[], start: number, end: number, d: Decoration): StyledChar[] {
  const inside = chars.slice(start, end).filter(c => c.ch !== "\n")
  if (inside.length === 0) return [...chars]
  const all = "bold" in d ? inside.every(c => c.bold) : d.color !== null && inside.every(c => c.color === d.color)
  const to: Partial<Style> = "bold" in d ? { bold: !all } : { color: all ? null : d.color }
  return chars.map((c, i) => (i >= start && i < end && c.ch !== "\n" ? { ...c, ...to } : c))
}

// 範囲 [start, end) を、装飾 style の字 text に置き換える（改行の字には装飾を付けない）
export function insertChars(
  chars: readonly StyledChar[],
  start: number,
  end: number,
  text: string,
  style: Style,
): StyledChar[] {
  const added = [...text].map(ch => (ch === "\n" ? { ch, ...PLAIN } : { ch, ...style }))
  return [...chars.slice(0, start), ...added, ...chars.slice(end)]
}

// 位置 at に書き足す字の装飾: 前の字（改行なら後ろの字）の装飾を継ぐ
export function styleAt(chars: readonly StyledChar[], at: number): Style {
  const prev = chars[at - 1]
  const c = prev && prev.ch !== "\n" ? prev : chars[at]
  return c && c.ch !== "\n" ? { bold: c.bold, color: c.color } : PLAIN
}
