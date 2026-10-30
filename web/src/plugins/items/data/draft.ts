// 編集のダイアログで書き換えている表（下書き）: セルは書いたままの文字で持ち、確定するときに列の型の値にする。
// 数の列のセルは、数として読める文字でなければ確定できない。列と行は、今の表から来た物だけが id を持つ（data-set がその id を保つ）
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
