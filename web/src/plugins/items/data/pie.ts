// 円グラフの寸法: x の列をラベルに、1 つ目の系列の値を扇の大きさにする。12 時から右回りに、項目の並べ方（sort）の順に描く。
// 扇は 9 つ以上なら、大きい 7 つを残し、ほかを「その他」にまとめる（色は系列の色の 8 つまで）。
// 値に負の数があるか、合計が 0 なら描かない。凡例は横に余裕があれば右に、無ければ下に、色の印とラベルと割合を並べる
import type { Size } from "../../../plugin-api"
import { textWidth } from "../../base"
import { CHART_LOOK, fitText, type Rect, rowOrder } from "./cartesian"
import type { DataProps } from "./data"
import { formatNumber } from "./scale"
import { cellText } from "./size"
import type { Table } from "./table"

const L = CHART_LOOK
// 扇の数の上限（これより多ければ「その他」にまとめる）
export const MAX_SLICES = 8

export interface Slice {
  color: number // 色の番号（0 から）
  rows: string[] // 扇の行（「その他」ならまとめた行）
  label: string // ラベル（「その他」なら空）
  value: number
  share: number // 割合（0〜1）
  path: string
}
export interface PieLegendItem {
  color: number
  text: string // ラベルと割合（入る幅で切る）
  x: number
  y: number
}

export type PieLayout =
  | { ok: true; center: { x: number; y: number }; r: number; slices: Slice[]; legend: PieLegendItem[] }
  | { ok: false; problem: "negative" | "zero" }

// 中心 (cx, cy)・半径 r の、角度 a0〜a1（12 時から右回りのラジアン）の扇
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (a1 - a0 >= 2 * Math.PI - 1e-9)
    return `M${cx},${cy - r}A${r},${r} 0 1 1 ${cx},${cy + r}A${r},${r} 0 1 1 ${cx},${cy - r}Z`
  const p = (a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`
  return `M${cx},${cy}L${p(a0)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}Z`
}

// 割合の文字（小数 1 桁の %）
export const shareText = (share: number): string => `${formatNumber(share * 100, 1)}%`

// 大きさ size の枠に描く円グラフ（軸が足りなければ null）。other は「その他」の文言
export function pieLayout(table: Table, props: DataProps, size: Size, other: string): PieLayout | null {
  const xCol = table.columns.findIndex(c => c.id === props.x)
  const vCol = table.columns.findIndex(c => c.id === props.series[0]?.column)
  if (xCol < 0 || vCol < 0) return null
  const rows = rowOrder(table, props)
    .map(i => table.rows[i])
    .filter(r => r !== undefined)
  const values = rows.map(r => r.cells[vCol] as number)
  if (values.some(v => v < 0)) return { ok: false, problem: "negative" }
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return { ok: false, problem: "zero" }
  // 9 つ以上なら、大きい 7 つ（並べ方の順のまま）と「その他」
  let parts = rows.map((r, i) => ({ rows: [r.id], label: cellText(r.cells[xCol] ?? ""), value: values[i] ?? 0 }))
  if (parts.length > MAX_SLICES) {
    const keep = new Set(
      parts
        .map((p, i) => ({ v: p.value, i }))
        .sort((a, b) => b.v - a.v || a.i - b.i)
        .slice(0, MAX_SLICES - 1)
        .map(x => x.i),
    )
    const rest = parts.filter((_, i) => !keep.has(i))
    parts = [
      ...parts.filter((_, i) => keep.has(i)),
      { rows: rest.flatMap(p => p.rows), label: other, value: rest.reduce((a, p) => a + p.value, 0) },
    ]
  }
  const inner: Rect = { x: L.pad, y: L.pad, w: size.w - 2 * L.pad, h: size.h - 2 * L.pad }
  const texts = parts.map(p => `${p.label} ${shareText(p.value / total)}`)
  const widest = Math.ceil(Math.max(0, ...texts.map(t => textWidth(t, L.font)))) + L.swatch + 4
  const side = inner.w - widest - L.legendGap >= inner.h * 0.8
  const legendH = parts.length * L.legend
  const pie: Rect = side
    ? { x: inner.x, y: inner.y, w: inner.w - widest - L.legendGap, h: inner.h }
    : { x: inner.x, y: inner.y, w: inner.w, h: Math.max(inner.h - legendH - L.tickGap, 0) }
  const r = Math.max(Math.min(pie.w, pie.h) / 2, 0)
  const cx = pie.x + pie.w / 2
  const cy = pie.y + pie.h / 2
  let a = 0
  const slices = parts.map((p, i) => {
    const share = p.value / total
    const a0 = a
    a += share * 2 * Math.PI
    return {
      color: i,
      rows: p.rows,
      label: p.label,
      value: p.value,
      share,
      path: share > 0 ? arc(cx, cy, r, a0, a) : "",
    }
  })
  const lx = side ? pie.x + pie.w + L.legendGap : inner.x
  const ly = side ? cy - legendH / 2 : pie.y + pie.h + L.tickGap
  const room = side ? widest - L.swatch - 4 : inner.w - L.swatch - 4
  const legend = parts.map((_, i) => ({
    color: i,
    text: fitText(texts[i] ?? "", room),
    x: lx,
    y: ly + i * L.legend,
  }))
  return { ok: true, center: { x: cx, y: cy }, r, slices, legend }
}
