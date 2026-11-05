// 刷るときの紙の決まり（見た目を持たない計算）: 並べた印刷区画の大きさごとに名前付きの @page を作り、紙ちょうどの大きさ・余白 0 で刷る
// （紙の大きさは 96dpi で刷ったときの px なので、そのまま CSS の px で書く）。大きさの違う紙が混ざっても、印刷区画ごとにその紙で刷る
import type { Size } from "../../../core/geom"

// 大きさ size の印刷区画を刷る @page の名前（CSS の名前は数字で始められないので頭に語を付ける）
export const pageNameOf = (size: Size): string => `sheet-${Math.round(size.w)}x${Math.round(size.h)}`

// 印刷区画の大きさの並び sizes を刷る @page の文（同じ大きさは 1 つにまとめる）
export function pageRules(sizes: readonly Size[]): string {
  const names = new Map(sizes.map(s => [pageNameOf(s), s]))
  return [...names]
    .map(([name, s]) => `@page ${name} { size: ${Math.round(s.w)}px ${Math.round(s.h)}px; margin: 0; }`)
    .join("\n")
}

// 印刷区画の左上と下の真ん中に入れる、ブック名とページ番号（入れないなら null）。番号は刷る紙全体の通し番号（index は 0 から）
export function sheetLabels(
  index: number,
  total: number,
  shows: { pageNumbers: boolean; bookName: boolean },
  bookName: string,
): { number: string | null; book: string | null } {
  return {
    number: shows.pageNumbers ? `${index + 1} / ${total}` : null,
    book: shows.bookName ? bookName : null,
  }
}
