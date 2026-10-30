// データの表の寸法: 列の幅は、見出し（太字）とセルのうち一番長い文字の幅に、左右の余白と罫線を足した幅。行の高さは 1 行ぶんで決まった高さ（セルの中では折り返さない）。
// 表の見た目のときは、表を入れ替えるたびに、表が全部見える大きさ（紙の大きさで止める）に合わせる。
// 文字の幅は base の text で計算するので、画面でも常駐でも同じ大きさになる。画面（DataItemView）はこの値のとおりに描く
import type { Size } from "../../../plugin-api"
import { TEXT_LOOK, textWidth } from "../../base"
import { DATA_MIN } from "./data"
import type { Cell, Table } from "./table"

// 表の見た目の寸法（px）。DataItemView.module.css と同じ値にする
export const TABLE_LOOK = {
  border: 1, // 外枠
  rule: 1, // 罫線
  padX: 8, // セルの左右の余白
  padY: 2, // セルの上下の余白
  line: TEXT_LOOK.line,
  head: TEXT_LOOK.caption, // 見出しの字
  cell: TEXT_LOOK.body, // セルの字
} as const

const L = TABLE_LOOK

// 行の高さ（罫線を含まない。2 行目からは上に罫線を引く）
export const ROW_HEIGHT = L.line + 2 * L.padY

// セルに書く文字
export const cellText = (cell: Cell): string => (typeof cell === "number" ? String(cell) : cell)

// 列の幅（2 列目からは左の罫線を含む）
export function columnWidths(table: Table): number[] {
  return table.columns.map((c, i) => {
    const widest = Math.max(
      textWidth(c.name, L.head),
      ...table.rows.map(r => textWidth(cellText(r.cells[i] ?? ""), L.cell)),
    )
    return Math.ceil(widest) + 2 * L.padX + (i > 0 ? L.rule : 0)
  })
}

// 表が全部見える大きさ（一番小さくてデータの一番小さい大きさ）
export function tableSize(table: Table): Size {
  const w = columnWidths(table).reduce((a, b) => a + b, 0) + 2 * L.border
  const h = (table.rows.length + 1) * ROW_HEIGHT + table.rows.length * L.rule + 2 * L.border
  return { w: Math.max(w, DATA_MIN.w), h: Math.max(h, DATA_MIN.h) }
}

// 表が全部見える大きさを、room（置いた所から紙の端まで）で止めた大きさ
export function fitTable(table: Table, room: Size): Size {
  const size = tableSize(table)
  return { w: Math.max(Math.min(size.w, room.w), DATA_MIN.w), h: Math.max(Math.min(size.h, room.h), DATA_MIN.h) }
}
