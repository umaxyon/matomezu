// 文字枠を文字に寄せる大きさ: 幅と折り返しは base の文字計算（フォントのデータ）で出し、ブラウザには測らせない

import { textWidth, wrap } from "../../base"
import { EMPTY_TEXT_WIDTH, TEXT_LINE_HEIGHT } from "./slide"

// 文字の右にカーソルの分だけ足す幅（px）
const CARET = 2

const fontOf = (size: number) => ({ size, weight: 400 as const })

// 枠の幅 frameWidth より長い行があるか（始めから折り返している枠か）
export function wrapsIn(text: string, size: number, frameWidth: number): boolean {
  const font = fontOf(size)
  return text.split("\n").some(line => textWidth(line, font) > frameWidth + 1)
}

// 文字 text（字の大きさ size）を収める枠の幅と高さ。折り返さない枠（wrapWidth が null）は、いちばん長い行の幅に合わせ、
// 折り返す枠は幅 wrapWidth のまま、高さだけを行の数に合わせる。空のときの幅は EMPTY_TEXT_WIDTH
export function textFitSize(text: string, size: number, wrapWidth: number | null): { w: number; h: number } {
  const font = fontOf(size)
  const lines = wrapWidth === null ? text.split("\n") : wrap(text, wrapWidth, font)
  const widest = Math.max(0, ...lines.map(line => textWidth(line, font)))
  return {
    w: wrapWidth ?? Math.max(EMPTY_TEXT_WIDTH, Math.ceil(widest) + CARET),
    h: Math.ceil(Math.max(1, lines.length) * size * TEXT_LINE_HEIGHT),
  }
}
