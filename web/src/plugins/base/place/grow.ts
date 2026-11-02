// 可変ページの広さ: 紙の大きさで区切った印刷区画を、中身が入るだけ並べる（place/items の pageArea が使う）。区切りの線の位置も出す
import type { GrowChoice } from "../../../core/def/paper"
import type { Rect, Size } from "../../../core/geom"

// 可変ページの増やす向き: 上・下・左・右のうち、どれへ印刷区画を増やすか
export interface GrowSides {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

// 利用者が選んだ増やす向き（ページの grows）の上・下・左・右
export const GROW_CHOICE_SIDES = {
  "right-down": { up: false, down: true, left: false, right: true },
  right: { up: false, down: false, left: false, right: true },
  down: { up: false, down: true, left: false, right: false },
  all: { up: true, down: true, left: true, right: true },
} as const satisfies Record<GrowChoice, GrowSides>

// 可変ページの増やす向きの決め方: 利用者が choices から選ぶ（最初のものが既定。ページの grows に選んだものを持つ）か、
// タイプがページで効いている設定の値 setting から決める（ページの grows は true）
export type GrowRule = { choices: readonly GrowChoice[] } | { sides(setting: (id: string) => unknown): GrowSides }

// 可変ページの増やす向きの決め方（定義オブジェクトの拡張ポイントに書き足す。無ければ可変ページを作れない。ページを持つタイプだけが使う）
declare module "../../../core/catalog" {
  interface BookTypeExtras {
    grow?: GrowRule
  }
}

// 紙の大きさ paper で区切った印刷区画を、中身の外枠 extent（紙の座標。無ければ中身が無い）が入るだけ、増やす向き sides に並べた数と、その広さ。
// 増やさない向きは 1 つ。spare なら、右・下へ増やす向きに空きの印刷区画を 1 つずつ足す（書く画面で、そこへ置けば増える）
export function grownArea(
  paper: Size,
  sides: GrowSides,
  extent: Rect | null,
  spare = false,
): { columns: number; rows: number; size: Size } {
  // 端がちょうど印刷区画の境目なら、次の印刷区画は要らない（割り算の誤差で 1 つ増やさない）。左（上）へ増やすページは、
  // 左（上）の空きの印刷区画をデータに持つ（items.ts の alignPadding）ので、少なくとも 2 つ
  const count = (end: number, len: number, before: boolean, after: boolean) =>
    before || after ? Math.max(before ? 2 : 1, Math.ceil(end / len - 1e-9)) + (spare && after ? 1 : 0) : 1
  const columns = count(extent ? extent.x + extent.w : 0, paper.w, sides.left, sides.right)
  const rows = count(extent ? extent.y + extent.h : 0, paper.h, sides.up, sides.down)
  return { columns, rows, size: { w: columns * paper.w, h: rows * paper.h } }
}

// 広さ area を紙の大きさ paper で区切った印刷区画の数と、境目の線の位置（縦の線の x と、横の線の y）。紙 1 枚に収まる広さなら null
export function printAreaLines(
  paper: Size,
  area: Size,
): { columns: number; rows: number; xs: number[]; ys: number[] } | null {
  if (area.w <= paper.w && area.h <= paper.h) return null
  const columns = Math.round(area.w / paper.w)
  const rows = Math.round(area.h / paper.h)
  return {
    columns,
    rows,
    xs: Array.from({ length: columns - 1 }, (_, i) => (i + 1) * paper.w),
    ys: Array.from({ length: rows - 1 }, (_, i) => (i + 1) * paper.h),
  }
}
