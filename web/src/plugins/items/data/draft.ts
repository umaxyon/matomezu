// 編集のダイアログで書き換えている表（下書き）: セルは書いたままの文字で持ち、確定するときに列の型の値にする。
// 数の列のセルは、数として読める文字でなければ確定できない。列と行は、今の表から来た物だけが id を持つ（data-set がその id を保つ）
import { type DataProps, type DataViewKind, MAX_SERIES, type Series } from "./data"
import { cellText } from "./size"
import type { ColumnType, Table } from "./table"

export interface DraftColumn {
  id?: string
  name: string
  type: ColumnType
}
export interface DraftRow {
  id?: string
  cells: string[]
}
export interface Draft {
  columns: DraftColumn[]
  rows: DraftRow[]
}

// 数として読める文字の値（前後の空白は除く。空や数でなければ null）
export function parseNumber(text: string): number | null {
  const s = text.trim()
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// 表の下書き（表が無ければ、列も行も無い）
export function toDraft(table: Table | undefined): Draft {
  if (!table) return { columns: [], rows: [] }
  return {
    columns: table.columns.map(c => ({ ...c })),
    rows: table.rows.map(r => ({ id: r.id, cells: r.cells.map(cellText) })),
  }
}

// 足した列のセルの初め: 数の列は 0、文字の列は空の文字
const blank = (type: ColumnType): string => (type === "number" ? "0" : "")

// 列の型 type のセルとして確定できる文字か
export const cellOk = (type: ColumnType, text: string): boolean => type === "text" || parseNumber(text) !== null

// どのセルも、列の型で確定できるか
export const draftOk = (d: Draft): boolean =>
  d.rows.every(r => r.cells.every((text, i) => cellOk(d.columns[i]?.type ?? "text", text)))

export function addColumn(d: Draft, name: string): Draft {
  return {
    columns: [...d.columns, { name, type: "number" }],
    rows: d.rows.map(r => ({ ...r, cells: [...r.cells, blank("number")] })),
  }
}

export function removeColumn(d: Draft, col: number): Draft {
  const columns = d.columns.filter((_, i) => i !== col)
  // 列が無くなれば、行も無くす（列の無い表は持たない）
  if (columns.length === 0) return { columns, rows: [] }
  return { columns, rows: d.rows.map(r => ({ ...r, cells: r.cells.filter((_, i) => i !== col) })) }
}

export function renameColumn(d: Draft, col: number, name: string): Draft {
  return { ...d, columns: d.columns.map((c, i) => (i === col ? { ...c, name } : c)) }
}

// 列の型を変える。文字の列を数の列にできるのは、どのセルも数として読めるときだけ（できなければ null）
export function retypeColumn(d: Draft, col: number, type: ColumnType): Draft | null {
  if (type === "number" && !d.rows.every(r => parseNumber(r.cells[col] ?? "") !== null)) return null
  return { ...d, columns: d.columns.map((c, i) => (i === col ? { ...c, type } : c)) }
}

export function addRow(d: Draft): Draft {
  return { ...d, rows: [...d.rows, { cells: d.columns.map(c => blank(c.type)) }] }
}

export function removeRow(d: Draft, row: number): Draft {
  return { ...d, rows: d.rows.filter((_, i) => i !== row) }
}

export function setCell(d: Draft, row: number, col: number, text: string): Draft {
  return {
    ...d,
    rows: d.rows.map((r, i) => (i === row ? { ...r, cells: r.cells.map((c, j) => (j === col ? text : c)) } : r)),
  }
}

// data-set に渡す列と行（確定できない下書きなら null）
export function draftArgs(
  d: Draft,
): { columns: DraftColumn[]; rows: { id?: string; cells: (string | number)[] }[] } | null {
  if (!draftOk(d)) return null
  return {
    columns: d.columns,
    rows: d.rows.map(r => ({
      ...(r.id ? { id: r.id } : {}),
      cells: r.cells.map((text, i) => (d.columns[i]?.type === "number" ? (parseNumber(text) ?? 0) : text)),
    })),
  }
}

// 下書きの軸: 列は下書きの列の位置で持つ（足したばかりの列は id を持たないため）。確定のときに、data-set が返した列の id に直す
export interface AxesDraft {
  view: DataViewKind
  x: number | null
  values: number[] // 値の列（系列の順）
  charts: (Series["chart"] | undefined)[] // 系列ごとの描き方（values と同じ順。ダイアログでは変えず、そのまま保つ）
  label: number | null // 散布図の点のラベル
  bar: DataProps["bar"]
  sort: DataProps["sort"]
  sortBy: number | null
  crowd: DataProps["crowd"]
  skip: DataProps["skip"]
  picked: number[] // 項目の文字を出す行（skip が picked のとき。下書きの行の位置）
}

// 項目の軸の下書き（表に無い列を名指す軸と、表に無い行は外す）
export function toAxesDraft(props: DataProps, table: Table | undefined): AxesDraft {
  const rows = new Set(props.picked ?? [])
  const index = (id: string | undefined) => {
    const i = table?.columns.findIndex(c => c.id === id) ?? -1
    return i >= 0 ? i : null
  }
  const kept = props.series.filter(s => index(s.column) !== null)
  return {
    view: props.view,
    x: index(props.x),
    values: kept.map(s => index(s.column) as number),
    charts: kept.map(s => s.chart),
    label: index(props.label),
    bar: props.bar,
    sort: props.sort,
    sortBy: index(props.sortBy),
    crowd: props.crowd,
    skip: props.skip,
    picked: (table?.rows ?? []).flatMap((r, i) => (rows.has(r.id) ? [i] : [])),
  }
}

// 行を消したときの軸（消した行の印を外し、後ろの行の位置を詰める）
export const axesWithoutRow = (a: AxesDraft, row: number): AxesDraft => ({
  ...a,
  picked: a.picked.flatMap(i => (i === row ? [] : [i > row ? i - 1 : i])),
})

// 行 row の項目の文字を出すかを入れ替える
export const togglePicked = (a: AxesDraft, row: number): AxesDraft => ({
  ...a,
  picked: a.picked.includes(row) ? a.picked.filter(i => i !== row) : [...a.picked, row].sort((x, y) => x - y),
})

// 列を消したときの軸（消した列を名指す軸を外し、後ろの列の位置を詰める）
export function axesWithout(a: AxesDraft, col: number): AxesDraft {
  const shift = (i: number | null) => (i === null || i === col ? null : i > col ? i - 1 : i)
  return {
    ...a,
    x: shift(a.x),
    values: a.values.flatMap(i => (i === col ? [] : [shift(i) as number])),
    charts: a.charts.filter((_, j) => a.values[j] !== col),
    label: shift(a.label),
    sortBy: shift(a.sortBy),
  }
}

// 軸が見た目に足りているか（表なら軸は要らない。散布図の X と値は数の列）
export function axesOk(a: AxesDraft, d: Draft): boolean {
  if (a.view === "table") return true
  const isNumber = (i: number | null) => i !== null && d.columns[i]?.type === "number"
  if (a.x === null || a.values.length === 0 || !a.values.every(isNumber)) return false
  return a.view !== "scatter" || isNumber(a.x)
}

// 確定のときに item-update に渡す項目（列と行の位置を、data-set が返した列と行の id に直す）。外した軸は null で消す。
// 円と散布図の値は 1 つ目だけ
export function axesProps(a: AxesDraft, columnIds: readonly string[], rowIds: readonly string[]) {
  const id = (i: number | null) => (i === null ? null : (columnIds[i] ?? null))
  const one = a.view === "pie" || a.view === "scatter"
  const series = (one ? a.values.slice(0, 1) : a.values).flatMap((i, j) => {
    const column = id(i)
    const chart = a.charts[j]
    return column === null ? [] : [{ column, ...(chart ? { chart } : {}) }]
  })
  const values = series.map(s => s.column)
  return {
    view: a.view,
    x: id(a.x),
    series,
    label: a.view === "scatter" ? id(a.label) : null,
    bar: a.bar,
    sort: a.sort,
    sortBy: values.includes(id(a.sortBy) ?? "") ? id(a.sortBy) : null,
    crowd: a.crowd,
    skip: a.skip,
    picked: a.skip === "picked" ? a.picked.flatMap(i => (rowIds[i] ? [rowIds[i]] : [])) : null,
  }
}

// 値の列 col を足す・外す（足せば系列の最後に。系列は MAX_SERIES まで）
export function toggleValue(a: AxesDraft, col: number): AxesDraft {
  const at = a.values.indexOf(col)
  if (at >= 0)
    return {
      ...a,
      values: a.values.filter((_, j) => j !== at),
      charts: a.charts.filter((_, j) => j !== at),
      sortBy: a.sortBy === col ? null : a.sortBy,
    }
  if (a.values.length >= MAX_SERIES) return a
  return { ...a, values: [...a.values, col], charts: [...a.charts, undefined] }
}

// 列 col を文字の列にしたときの軸（値の列から外す）
export const axesForText = (a: AxesDraft, col: number): AxesDraft => (a.values.includes(col) ? toggleValue(a, col) : a)

// 見た目を view にした軸。グラフで、軸が無いか見た目に合わない（散布図の X が文字の列）なら、既定の列を選び直す
// （x は 1 列目、散布図なら値でない最初の数の列。値は x でない最初の数の列。axes.ts の settleAxes と同じ既定）
export function withView(a: AxesDraft, d: Draft, view: DataViewKind): AxesDraft {
  const next = { ...a, view }
  if (view === "table") return next
  const numbers = d.columns.flatMap((c, i) => (c.type === "number" ? [i] : []))
  let x = a.x
  if (view === "scatter" && (x === null || !numbers.includes(x)))
    x = numbers.find(i => i !== a.values[0]) ?? numbers[0] ?? null
  if (x === null) x = d.columns.length > 0 ? 0 : null
  if (a.values.length > 0) return { ...next, x }
  const value = numbers.find(i => i !== x)
  return { ...next, x, values: value === undefined ? [] : [value], charts: value === undefined ? [] : [undefined] }
}
