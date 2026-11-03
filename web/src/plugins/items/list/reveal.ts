// 行を見せる: 外から頼まれた行（Revealable の reveal）を、行の並びのスクロールの見える所へ動かす量
// 行の並びのスクロールを動かす量（倍率をかける前の長さで）: 見える所の上から top にある高さ height の行を、見える高さ seen の中に入れる。
// 入りきらないか上にはみ出せば行の上を、下にはみ出せば行の下をそろえる。もう見えていれば動かさない
export function rowScroll(top: number, height: number, seen: number): number {
  if (top < 0 || height > seen) return top
  if (top + height > seen) return top + height - seen
  return 0
}
