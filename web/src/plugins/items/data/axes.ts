// グラフの軸を表に合わせる: 表に無い列・型の合わない列を名指した軸を外し、グラフの見た目で軸が無ければ既定の列を選ぶ。
// 既定は、x が 1 列目、系列が x でない最初の数の列（散布図は、x が最初の数の列、系列が次の数の列）。
// 表が無い間は、軸をそのままにする（表を入れたときに合わせる）
import type { DataProps, Series } from "./data"
import type { Column, Table } from "./table"

const isNumber = (c: Column | undefined): boolean => c?.type === "number"

export function settleAxes(props: DataProps, table: Table | undefined): DataProps {
  if (!table) return props
  const byId = new Map(table.columns.map(c => [c.id, c]))
  const scatter = props.view === "scatter"
  let x = props.x !== undefined && byId.has(props.x) ? props.x : undefined
  if (scatter && x !== undefined && !isNumber(byId.get(x))) x = undefined
  const seen = new Set<string>()
  let series: Series[] = props.series.filter(s => {
    const ok = isNumber(byId.get(s.column)) && !seen.has(s.column)
    seen.add(s.column)
    return ok
  })
  if (props.view !== "table" && x === undefined && series.length === 0) {
    const numbers = table.columns.filter(c => c.type === "number")
    x = scatter ? numbers[0]?.id : table.columns[0]?.id
    const value = numbers.find(c => c.id !== x)
    series = value ? [{ column: value.id }] : []
  }
  const label = props.label !== undefined && byId.has(props.label) ? props.label : undefined
  const sortBy = props.sortBy !== undefined && series.some(s => s.column === props.sortBy) ? props.sortBy : undefined
  const { x: _x, label: _label, sortBy: _sortBy, ...rest } = props
  return {
    ...rest,
    series,
    ...(x !== undefined ? { x } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(sortBy !== undefined ? { sortBy } : {}),
  }
}
