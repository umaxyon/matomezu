// 散布図の寸法: x の列を横、1 つ目の系列を縦の値にして、行ごとに点を打つ。どちらの軸も値の範囲に合わせたきりのよい目盛り。
// 点は半径 4px で、地の色の 2px の輪を付ける。点のラベル（label の列）は描かず、ポインタを乗せたときに出す
import type { Size } from "../../../plugin-api"
import { textWidth } from "../../base"
import { CHART_LOOK, type Rect, type Tick } from "./cartesian"
import type { DataProps } from "./data"
import { niceTicks, tickText } from "./scale"
import { cellText } from "./size"
import type { Table } from "./table"

const L = CHART_LOOK

export interface Dot {
  x: number
  y: number
  row: string
  label: string // 点のラベル（label の列が無ければ空）
  xValue: number
  yValue: number
}
export interface ScatterLayout {
  plot: Rect
  xTicks: Tick[]
  yTicks: Tick[]
  dots: Dot[]
  xName: string
  yName: string
}

// 大きさ size の枠に描く散布図（軸が足りなければ null）
export function scatterLayout(table: Table, props: DataProps, size: Size): ScatterLayout | null {
  const xCol = table.columns.findIndex(c => c.id === props.x)
  const yCol = table.columns.findIndex(c => c.id === props.series[0]?.column)
  const lCol = table.columns.findIndex(c => c.id === props.label)
  if (xCol < 0 || yCol < 0 || table.columns[xCol]?.type !== "number") return null
  const xs = table.rows.map(r => r.cells[xCol] as number)
  const ys = table.rows.map(r => r.cells[yCol] as number)
  const inner: Rect = { x: L.pad, y: L.pad, w: size.w - 2 * L.pad, h: size.h - 2 * L.pad }
  const range = (v: number[]) => (v.length > 0 ? [Math.min(...v), Math.max(...v)] : [0, 1]) as [number, number]
  const yt = niceTicks(...range(ys), false, Math.max(2, Math.min(6, Math.floor(inner.h / 36))))
  const xt = niceTicks(...range(xs), false, Math.max(2, Math.min(6, Math.floor(inner.w / 64))))
  const yTexts = yt.values.map(v => tickText(v, yt))
  const xTexts = xt.values.map(v => tickText(v, xt))
  const axisW = Math.ceil(Math.max(0, ...yTexts.map(t => textWidth(t, L.font)))) + L.tickGap
  const lift = Math.ceil(L.line / 2)
  const right = Math.ceil(textWidth(xTexts[xTexts.length - 1] ?? "", L.font) / 2)
  const plot: Rect = {
    x: inner.x + axisW,
    y: inner.y + lift,
    w: Math.max(inner.w - axisW - right, 1),
    h: Math.max(inner.h - lift - L.line - L.tickGap, 1),
  }
  const px = (v: number) => plot.x + (plot.w * (v - xt.min)) / (xt.max - xt.min)
  const py = (v: number) => plot.y + (plot.h * (yt.max - v)) / (yt.max - yt.min)
  return {
    plot,
    xTicks: xt.values.map((v, i) => ({ pos: px(v), text: xTexts[i] ?? "" })),
    yTicks: yt.values.map((v, i) => ({ pos: py(v), text: yTexts[i] ?? "" })),
    dots: table.rows.map((r, i) => ({
      x: px(xs[i] ?? 0),
      y: py(ys[i] ?? 0),
      row: r.id,
      label: lCol >= 0 ? cellText(r.cells[lCol] ?? "") : "",
      xValue: xs[i] ?? 0,
      yValue: ys[i] ?? 0,
    })),
    xName: table.columns[xCol]?.name ?? "",
    yName: table.columns[yCol]?.name ?? "",
  }
}
