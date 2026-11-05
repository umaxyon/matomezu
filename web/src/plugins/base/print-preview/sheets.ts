// 印刷プレビューの並べ方: ブックの全ページの印刷区画を、ページの順に 1 列（縦）か 1 行（横）に並べる（プレビューと印刷で共有する純粋な関数）。
// 1 ページの印刷区画の数（列と行）は見せ方から受け取る。可変ページでないページは 1 つ。shown が外した印刷区画は並べない
// （ページの印刷区画がどれも外れたら、そのページは並べない）
import type { Size } from "../../../core/geom"
import type { SheetFlow, SheetOrder } from "./settings"

export const SHEET_GAP = 24 // 並べた印刷区画の間（px。0 なら間を空けずにつなぐ）

// 1 ページの印刷区画: 紙の大きさ paper で区切った columns 列 × rows 行
export interface PageSheets {
  page: string
  paper: Size
  columns: number
  rows: number
}

// 並べた印刷区画 1 つ: ページの column 列目・row 行目（0 から）の区画を、並べた中の x・y に置く。index は印刷の順（0 から）
export interface Sheet {
  page: string
  column: number
  row: number
  index: number
  x: number
  y: number
  w: number
  h: number
}

export interface SheetLayout {
  sheets: readonly Sheet[]
  size: Size // 並べた広さ
}

export interface ArrangeOptions {
  flow: SheetFlow
  order: SheetOrder
  gap?: number
  shown?(page: string, column: number, row: number): boolean // 並べる印刷区画か（無ければ全部）
}

// ページの印刷区画を、数える順 order に並べた列と行
function cellsOf(p: PageSheets, order: SheetOrder): { column: number; row: number }[] {
  const outer = order === "across" ? p.rows : p.columns
  const inner = order === "across" ? p.columns : p.rows
  return Array.from({ length: outer * inner }, (_, i) => {
    const o = Math.floor(i / inner)
    const n = i % inner
    return order === "across" ? { column: n, row: o } : { column: o, row: n }
  })
}

// ページ pages の印刷区画を並べる。並べる向きと交わる向きは、いちばん大きい紙に合わせて真ん中にそろえる
export function arrangeSheets(pages: readonly PageSheets[], options: ArrangeOptions): SheetLayout {
  const { flow, order, gap = SHEET_GAP, shown } = options
  const picked = pages.flatMap(p =>
    cellsOf(p, order)
      .filter(c => !shown || shown(p.page, c.column, c.row))
      .map(c => ({ page: p.page, paper: p.paper, ...c })),
  )
  const across = Math.max(0, ...picked.map(s => (flow === "column" ? s.paper.w : s.paper.h)))
  let along = 0
  const sheets = picked.map((s, index) => {
    const { w, h } = s.paper
    const at = along
    along += (flow === "column" ? h : w) + gap
    const x = flow === "column" ? (across - w) / 2 : at
    const y = flow === "column" ? at : (across - h) / 2
    return { page: s.page, column: s.column, row: s.row, index, x, y, w, h }
  })
  const length = Math.max(0, along - gap)
  return { sheets, size: flow === "column" ? { w: across, h: length } : { w: length, h: across } }
}
