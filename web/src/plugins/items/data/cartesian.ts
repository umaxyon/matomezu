// 棒と折れ線のグラフの寸法: 横軸（項目）に x の列の値を並べ、系列の値を縦軸 1 本に描く（横向きの棒なら、項目を縦に並べ、値を横に伸ばす）。
// 棒はいつも 0 から伸ばし、項目ごとに系列の棒を 2px 空けて並べる（太さは 24px まで）。折れ線は項目の真ん中を 2px の線で結ぶ。
// 系列が 2 つ以上なら上に凡例を出す。項目の文字が入りきらなければ、最初と最後を必ず出して、間を同じ間隔で飛ばす。収まらない文字は … で切る。
// 文字の幅は base の text で計算する。画面（ChartView）はこの値のとおりに描く
import type { Size } from "../../../plugin-api"
import { type Font, textWidth } from "../../base"
import type { DataProps } from "./data"
import { niceTicks, tickText } from "./scale"
import { cellText } from "./size"
import type { Table } from "./table"

// グラフの寸法（px）。ChartView と同じ値にする
export const CHART_LOOK = {
  pad: 8, // 枠の内側の余白
  font: { size: 11, weight: 400 } satisfies Font, // 軸と凡例の字
  line: 14, // 軸と凡例の文字の 1 行の高さ
  tickGap: 4, // 軸の文字と描く所の間
  legend: 18, // 凡例の 1 行の高さ
  swatch: 8, // 凡例の色の印の大きさ
  legendGap: 12, // 凡例の項目の間
  barMax: 24, // 棒の太さの上限
  gap: 2, // 並んだ棒の間
  dot: 4, // 折れ線の点の半径
  labelGap: 6, // 並んだ項目の文字の間
} as const

const L = CHART_LOOK

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// 項目 1 つ（横軸の文字。shown なら描く。text は入る幅まで切った文字）
export interface Category {
  row: string
  label: string
  text: string
  center: number // 項目の真ん中（縦の棒なら x、横の棒なら y）
  shown: boolean
}
export interface Bar extends Rect {
  series: number
  row: string
  value: number
}
export interface LinePoint {
  x: number
  y: number
  row: string
  value: number
}
export interface Tick {
  pos: number // 値の軸の上の位置（縦の棒なら y、横の棒なら x）
  text: string
}
export interface LegendItem {
  series: number
  name: string
  x: number
  y: number
}

export interface CartesianLayout {
  horizontal: boolean
  plot: Rect // 描く所（軸の文字の内側）
  zero: number // 値 0 の位置（棒の根元）
  ticks: Tick[]
  categories: Category[]
  bars: Bar[]
  lines: { series: number; points: LinePoint[] }[]
  legend: LegendItem[]
}

// 描く系列（値の列の位置と名前と、棒か折れ線か）
interface Drawn {
  index: number // 系列の番号（色の順）
  col: number
  name: string
  chart: "bar" | "line"
}

// 文字を幅 w に収まるように切った文字（切ったら最後に …）
export function fitText(text: string, w: number, font: Font = L.font): string {
  if (textWidth(text, font) <= w) return text
  const chars = [...text]
  while (chars.length > 0 && textWidth(`${chars.join("")}…`, font) > w) chars.pop()
  return chars.length > 0 ? `${chars.join("")}…` : ""
}

// 項目を並べる順（行の番号の並び）: sort が none なら表の順、desc・asc なら sortBy の列（無ければ 1 つ目の系列）の値で並べる（同じ値は表の順）
export function rowOrder(table: Table, props: DataProps): number[] {
  const all = table.rows.map((_, i) => i)
  if (props.sort === "none") return all
  const by = props.sortBy ?? props.series[0]?.column
  const col = table.columns.findIndex(c => c.id === by)
  if (col < 0) return all
  const value = (i: number) => table.rows[i]?.cells[col] as number
  const sign = props.sort === "desc" ? -1 : 1
  return all.sort((a, b) => sign * (value(a) - value(b)) || a - b)
}

// 最初と最後を必ず出し、間を同じ間隔で飛ばす（step 個ごとに 1 つ）。最後の直前の出す項目が最後に近すぎれば、それを出さない
export function evenShown(n: number, step: number): boolean[] {
  const shown = Array.from({ length: n }, (_, i) => i % step === 0)
  if (n > 1 && !shown[n - 1]) {
    shown[n - 1] = true
    const prev = Math.floor((n - 1) / step) * step
    if (prev > 0 && n - 1 - prev < step) shown[prev] = false
  }
  return shown
}

// 凡例の項目を、幅 w の中に左から並べる（入らなければ次の行へ）。返すのは項目と、使った高さ
function legendOf(drawn: readonly Drawn[], w: number, top: number, left: number): { items: LegendItem[]; h: number } {
  if (drawn.length < 2) return { items: [], h: 0 }
  const items: LegendItem[] = []
  let x = left
  let y = top
  for (const d of drawn) {
    const need = L.swatch + 4 + Math.ceil(textWidth(d.name, L.font))
    if (x > left && x + need > left + w) {
      x = left
      y += L.legend
    }
    items.push({ series: d.index, name: d.name, x, y })
    x += need + L.legendGap
  }
  return { items, h: y - top + L.legend }
}

// 大きさ size の枠に描く、棒と折れ線のグラフ（軸が足りなければ null）
export function cartesianLayout(table: Table, props: DataProps, size: Size): CartesianLayout | null {
  const xCol = table.columns.findIndex(c => c.id === props.x)
  const drawn: Drawn[] = props.series.flatMap((s, index) => {
    const col = table.columns.findIndex(c => c.id === s.column)
    const column = table.columns[col]
    if (!column) return []
    return [{ index, col, name: column.name, chart: s.chart ?? (props.view === "line" ? "line" : "bar") }]
  })
  if (xCol < 0 || drawn.length === 0) return null
  const horizontal = props.view === "bar" && props.bar === "horizontal"
  // 横向きの棒には折れ線を重ねない（どの系列も棒）
  const series = horizontal ? drawn.map(d => ({ ...d, chart: "bar" as const })) : drawn
  const order = rowOrder(table, props)
  const rows = order.map(i => table.rows[i]).filter(r => r !== undefined)
  const values = rows.flatMap(r => series.map(s => r.cells[s.col] as number))
  const hasBars = series.some(s => s.chart === "bar")
  const lo = values.length > 0 ? Math.min(...values) : 0
  const hi = values.length > 0 ? Math.max(...values) : 1
  const inner = { x: L.pad, y: L.pad, w: size.w - 2 * L.pad, h: size.h - 2 * L.pad }
  const legend = legendOf(series, inner.w, inner.y, inner.x)
  const top = inner.y + legend.h
  const labels = rows.map(r => cellText(r.cells[xCol] ?? ""))
  const widest = Math.max(0, ...labels.map(t => textWidth(t, L.font)))
  // 値の軸の目盛り（棒があれば 0 を含める）。目盛りの数は軸の長さから決める
  const valueLen = horizontal ? inner.w : inner.h - legend.h
  const ticks = niceTicks(lo, hi, hasBars, Math.max(2, Math.min(6, Math.floor(valueLen / (horizontal ? 64 : 36)))))
  const tickTexts = ticks.values.map(v => tickText(v, ticks))
  let plot: Rect
  if (horizontal) {
    const catW = Math.min(Math.ceil(widest), Math.floor(inner.w * 0.35)) + L.tickGap
    const tickH = L.line + L.tickGap
    // 一番右の目盛りの文字が枠からはみ出さないように、右に文字の半分を空ける
    const right = Math.ceil(textWidth(tickTexts[tickTexts.length - 1] ?? "", L.font) / 2)
    plot = { x: inner.x + catW, y: top, w: inner.w - catW - right, h: inner.y + inner.h - top - tickH }
  } else {
    const axisW = Math.ceil(Math.max(0, ...tickTexts.map(t => textWidth(t, L.font)))) + L.tickGap
    const catH = L.line + L.tickGap
    // 一番上の目盛りの文字が枠や凡例に重ならないように、上に文字の半分を空ける
    const lift = Math.ceil(L.line / 2)
    plot = { x: inner.x + axisW, y: top + lift, w: inner.w - axisW, h: inner.y + inner.h - top - lift - catH }
  }
  plot = { ...plot, w: Math.max(plot.w, 1), h: Math.max(plot.h, 1) }
  const span = ticks.max - ticks.min
  // 値の位置（縦の棒なら上から、横の棒なら左から）
  const at = (v: number) =>
    horizontal ? plot.x + (plot.w * (v - ticks.min)) / span : plot.y + (plot.h * (ticks.max - v)) / span
  const zero = at(Math.min(Math.max(0, ticks.min), ticks.max))
  const n = rows.length
  const band = (horizontal ? plot.h : plot.w) / Math.max(n, 1)
  const start = horizontal ? plot.y : plot.x
  const center = (i: number) => start + band * (i + 0.5)
  // 項目の文字: 入る間隔で飛ばし、出す文字は使える幅で切る
  const need = horizontal ? L.line : Math.ceil(widest) + L.labelGap
  const step = Math.max(1, Math.ceil(need / Math.max(band, 1)))
  const shown = evenShown(n, step)
  const room = horizontal ? plot.x - inner.x - L.tickGap : band * step - L.labelGap
  const categories = rows.map((r, i) => ({
    row: r.id,
    label: labels[i] ?? "",
    text: fitText(labels[i] ?? "", room),
    center: center(i),
    shown: shown[i] ?? false,
  }))
  // 棒: 項目ごとに、棒の系列を 2px 空けて並べる
  const barSeries = series.filter(s => s.chart === "bar")
  const k = barSeries.length
  const thick = k > 0 ? Math.max(1, Math.min(L.barMax, (band * 0.7 - L.gap * (k - 1)) / k)) : 0
  const group = k * thick + (k - 1) * L.gap
  const bars: Bar[] = rows.flatMap((r, i) =>
    barSeries.map((s, j) => {
      const value = r.cells[s.col] as number
      const along = center(i) - group / 2 + j * (thick + L.gap)
      const end = at(value)
      const [from, to] = [Math.min(zero, end), Math.max(zero, end)]
      return horizontal
        ? { x: from, y: along, w: to - from, h: thick, series: s.index, row: r.id, value }
        : { x: along, y: from, w: thick, h: to - from, series: s.index, row: r.id, value }
    }),
  )
  const lines = series
    .filter(s => s.chart === "line")
    .map(s => ({
      series: s.index,
      points: rows.map((r, i) => {
        const value = r.cells[s.col] as number
        return { x: center(i), y: at(value), row: r.id, value }
      }),
    }))
  return {
    horizontal,
    plot,
    zero,
    ticks: ticks.values.map((v, i) => ({ pos: at(v), text: tickTexts[i] ?? "" })),
    categories,
    bars,
    lines,
    legend: legend.items,
  }
}

// 棒の形の path: 値の先の角を半径 4px（棒の太さの半分まで）で丸め、根元は四角のまま
export function barPath(bar: Bar, horizontal: boolean, zero: number): string {
  const { x, y, w, h } = bar
  if (w <= 0 || h <= 0) return ""
  if (horizontal) {
    const r = Math.min(4, h / 2, w)
    // 根元が左（正の値）なら右の角を、根元が右（負の値）なら左の角を丸める
    return x >= zero - 0.5
      ? `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`
      : `M${x + w},${y}H${x + r}A${r},${r} 0 0 0 ${x},${y + r}V${y + h - r}A${r},${r} 0 0 0 ${x + r},${y + h}H${x + w}Z`
  }
  const r = Math.min(4, w / 2, h)
  // 根元が下（正の値）なら上の角を、根元が上（負の値）なら下の角を丸める
  return y + h <= zero + 0.5
    ? `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}A${r},${r} 0 0 0 ${x + r},${y + h}H${x + w - r}A${r},${r} 0 0 0 ${x + w},${y + h - r}V${y}Z`
}
