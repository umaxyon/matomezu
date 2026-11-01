// 伸びるページの広さ: 紙の大きさで区切った印刷区画を、中身が入るだけ並べる（place/items の pageArea が使う）。区切りの線の位置も出す
import type { Rect, Size } from "../../../core/geom"
import type { GrowDirection } from "../../../core/paper"

// 紙の大きさ paper で区切った印刷区画を、中身の外枠 extent（紙の座標。無ければ中身が無い）が入るだけ、
// grow の向き（both は右と下、down は下だけ）に並べた数と、その広さ。spare なら、伸びる向きに空きの印刷区画を 1 つずつ足す（書く画面で、そこへ置けば増える）
export function grownArea(
  paper: Size,
  grow: GrowDirection,
  extent: Rect | null,
  spare = false,
): { columns: number; rows: number; size: Size } {
  // 端がちょうど印刷区画の境目なら、次の印刷区画は要らない（割り算の誤差で 1 つ増やさない）
  const count = (end: number, len: number) => Math.max(1, Math.ceil(end / len - 1e-9)) + (spare ? 1 : 0)
  const columns = grow === "both" ? count(extent ? extent.x + extent.w : 0, paper.w) : 1
  const rows = count(extent ? extent.y + extent.h : 0, paper.h)
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
