// データの表: 型の決まった列と、列の数だけセルを持つ行の 2 次元の表。数の列のセルはどれも数、文字の列のセルはどれも文字で、空のセルは無い。
// 列と行は id を持ち（ブックの中で重ならない）、グラフの軸は列を id で名指す。列の名前を変えても軸は外れない
import { z } from "zod"

// 列の型: 数（number）か文字（text）
export const COLUMN_TYPES = ["number", "text"] as const
export type ColumnType = (typeof COLUMN_TYPES)[number]

export const ColumnSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(), // 見出しに出す列の名前
  type: z.enum(COLUMN_TYPES),
})
export type Column = z.infer<typeof ColumnSchema>

// セル: 数の列は有限の数、文字の列は文字
export const CellSchema = z.union([z.number().finite(), z.string()])
export type Cell = z.infer<typeof CellSchema>

export const TableRowSchema = z.strictObject({
  id: z.string().min(1),
  cells: z.array(CellSchema), // 列の順に、列の数だけ
})
export type TableRow = z.infer<typeof TableRowSchema>

// セルの並びが列の数と型に合うか
export const cellsFit = (columns: readonly Pick<Column, "type">[], cells: readonly Cell[]): boolean =>
  cells.length === columns.length &&
  cells.every((c, i) => (columns[i]?.type === "number" ? typeof c === "number" : typeof c === "string"))

// 列と行の id がどれも重ならないか
const uniqueIds = (table: { columns: readonly { id: string }[]; rows: readonly { id: string }[] }): boolean => {
  const ids = [...table.columns, ...table.rows].map(x => x.id)
  return new Set(ids).size === ids.length
}

// 表: 列は 1 つ以上（列の無い表は持たない）、行は 0 個以上。どの行のセルも列に合う
export const TableSchema = z
  .strictObject({
    columns: z.array(ColumnSchema).min(1),
    rows: z.array(TableRowSchema),
  })
  .refine(t => t.rows.every(r => cellsFit(t.columns, r.cells)), {
    message: "Every row has one cell per column, a number in a number column and a string in a text column",
  })
  .refine(uniqueIds, { message: "Column and row ids are all different" })
export type Table = z.infer<typeof TableSchema>
