// 字の幅を確かめる e2e の本文と、その字の幅を core で計算した表。表は scripts/e2e-build.ts が e2e の前に作る（e2e は web/src を読まないため）
import { readFileSync } from "node:fs"

export const BODY =
  "matomezu は図を描く道具です。「箱」の本文は、幅に合わせて折り返し、高さに収まらない分は切ります。Noto Sans JP で描きます。"

// 表の字の大きさと太さ
export const BODY_FONT = { size: 13, weight: 400 }

// 表のファイル: BODY の切り出し（末尾に … を付けた物も）ごとの、BODY_FONT での幅（px）
export const TEXT_WIDTHS_FILE = "e2e/.text-widths.json"

// 表に載せる文字列: BODY のどこからどこまでを切り出した物と、その末尾に … を付けた物
export const bodyPieces = (): string[] => {
  const chars = [...BODY]
  return chars.flatMap((_, from) =>
    chars.slice(from).flatMap((_, n) => {
      const piece = chars.slice(from, from + n + 1).join("")
      return [piece, `${piece}…`]
    }),
  )
}

// core で計算した幅（無い文字列は undefined）
export const coreWidthOf = (() => {
  let table: Record<string, number> | undefined
  return (text: string): number | undefined => {
    table ??= JSON.parse(readFileSync(TEXT_WIDTHS_FILE, "utf8")) as Record<string, number>
    return table[text]
  }
})()
