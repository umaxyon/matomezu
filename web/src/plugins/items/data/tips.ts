// グラフの吹き出しの中身: ポインタを乗せた棒・点・扇の、見出しと、色の印・名前・値の行
import type { CartesianLayout } from "./cartesian"
import type { DataProps } from "./data"
import { type Slice, shareText } from "./pie"
import { formatNumber } from "./scale"
import type { Dot, ScatterLayout } from "./scatter"
import type { Table } from "./table"

export interface TipContent {
  title: string
  lines: { color?: number; name: string; value: string }[]
}

// 系列の名前（系列の番号の順。値の列の名前）
export function seriesNames(table: Table, props: DataProps): string[] {
  const names = new Map(table.columns.map(c => [c.id, c.name]))
  return props.series.map(s => names.get(s.column) ?? "")
}

// 棒と折れ線: 項目 row の名前と、その項目の全部の系列の値
export function cartesianTip(c: CartesianLayout, row: string, names: readonly string[]): TipContent {
  const line = (series: number, value: number) => ({
    color: series,
    name: names[series] ?? "",
    value: formatNumber(value),
  })
  return {
    title: c.categories.find(k => k.row === row)?.label ?? "",
    lines: [
      ...c.bars.filter(b => b.row === row).map(b => line(b.series, b.value)),
      ...c.lines.flatMap(l => l.points.filter(p => p.row === row).map(p => line(l.series, p.value))),
    ],
  }
}

// 円: 扇のラベルと、割合と値
export const pieTip = (s: Slice): TipContent => ({
  title: s.label,
  lines: [{ color: s.color, name: shareText(s.share), value: formatNumber(s.value) }],
})

// 散布図: 点のラベルと、X と Y の値
export const scatterTip = (sc: ScatterLayout, d: Dot): TipContent => ({
  title: d.label,
  lines: [
    { name: sc.xName, value: formatNumber(d.xValue) },
    { name: sc.yName, value: formatNumber(d.yValue) },
  ],
})
