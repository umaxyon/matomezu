// 書庫の画面の左（ツリー）の幅（px）。境目をドラッグして変え、値が無ければ既定の幅。
// 窓が狭くなって覚えた幅が入らないときは、見せる所（CSS）で縮める。覚えた値は変えない

export const DEFAULT_TREE_WIDTH = 260
export const TREE_MIN_WIDTH = 160
export const CONTENT_MIN_WIDTH = 320 // 右の中身に残す幅

// 書庫の幅 length の左から at の所に境目を動かしたときの、ツリーの幅（TREE_MIN_WIDTH から、右に CONTENT_MIN_WIDTH を残す所までに収め、整数に丸める）。
// 書庫が狭くて両方の最小が入らないときは、ツリーの最小にする
export function treeWidthAt(at: number, length: number): number {
  const max = Math.max(TREE_MIN_WIDTH, length - CONTENT_MIN_WIDTH)
  return Math.round(Math.min(max, Math.max(TREE_MIN_WIDTH, at)))
}
