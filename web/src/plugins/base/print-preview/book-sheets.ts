// ブックの全ページの印刷区画の数と、印刷プレビューの並べ方（ブックの設定の項目で決める）。何も載っていない印刷区画は並べない（filled.ts）
import { pagedOf } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Point } from "../../../core/geom"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt, settingValue } from "../book-settings"
import { growOf, pageArea, paperSize } from "../place/items"
import type { PrintSheets, SheetPurpose } from "."
import { crossingShapes, filledSheets, sheetKey } from "./filled"
import { PRINT_PREVIEW_FLOW, PRINT_PREVIEW_ORDER } from "./settings"
import { arrangeSheets, type PageSheets, type SheetLayout } from "./sheets"

// ページ page の印刷区画（purpose は数える物。印刷に並べる並べ方か、書く画面の並べ方か）: 見せ方の printSheets があればそれ、無ければ形の位置から（中身が入るだけ並べた数。base の pageArea と filledSheets。
// 載っている印刷区画を判定できないタイプは filled が null で、どの印刷区画も載っているとして扱う）
export function sheetsOfPage(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  purpose: SheetPurpose = "print",
): (Omit<PrintSheets, "filled"> & { filled: ReadonlySet<string> | null }) | null {
  const own = catalog.presentations.get(bookType(catalog, book.type).presentation)?.printSheets
  if (own)
    return own(catalog, page, { setting: settingsAt(catalog, book, page), grow: growOf(catalog, book, page), purpose })
  const area = pageArea(catalog, book, page)
  return area && { columns: area.columns, rows: area.rows, filled: filledSheets(catalog, book, page) }
}

// 描いて測ってから決める印刷区画の数: ページの id → 測った行の数（測っている途中なら pending。そのページはまだ並べない）。
// 測る見せ方（ブックのビューの printMeasure）のページだけが入る
export type MeasuredSheets = ReadonlyMap<string, number | "pending">

// ブック book の各ページの印刷区画（描けない紙のページは並べない）。measured にあるページは、測った数（1 列）
export function pageSheetsOf(catalog: CoreCatalog, book: Book, measured: MeasuredSheets = new Map()): PageSheets[] {
  return (pagedOf(book)?.pages ?? []).flatMap(page => {
    const paper = paperSize(catalog, page)
    if (!paper) return []
    // 測るページは測った数（測っている途中と、測って何も無ければ並べない）
    const rows = measured.get(page.id)
    if (rows !== undefined) return rows === "pending" || rows === 0 ? [] : [{ page: page.id, paper, columns: 1, rows }]
    const sheets = sheetsOfPage(catalog, book, page)
    return sheets ? [{ page: page.id, paper, columns: sheets.columns, rows: sheets.rows }] : []
  })
}

// ブック book の可変ページで、印刷区画の境目をまたぐ形（ページの id と、またぐ形・印刷区画より大きい形の id。どちらも無いページは入れない）。
// 調べるのは、またいだ形を直してもらうタイプ（ブックのタイプの printCrossing が ask）だけ
export function bookCrossings(
  catalog: CoreCatalog,
  book: Book,
): { page: string; crossing: readonly string[]; oversized: readonly string[] }[] {
  if (bookType(catalog, book.type).printCrossing !== "ask") return []
  return (pagedOf(book)?.pages ?? []).flatMap(page => {
    if (!growOf(catalog, book, page)) return []
    const found = crossingShapes(catalog, page)
    return found.crossing.length + found.oversized.length > 0 ? [{ page: page.id, ...found }] : []
  })
}

// ブック book に、印刷区画の境目をまたぐ形があるか（あれば印刷プレビューを開かず、直してもらう）
export const hasCrossing = (catalog: CoreCatalog, book: Book): boolean =>
  bookCrossings(catalog, book).some(c => c.crossing.length > 0)

// ブック book を、印刷プレビューの設定の項目のとおりに並べる（何も載っていない印刷区画は並べない。何も載っていないページは並べない）。
// measured にあるページは測った数だけ並べる（測った印刷区画には、どれも何か載っている）
export function bookSheets(catalog: CoreCatalog, book: Book, measured: MeasuredSheets = new Map()): SheetLayout {
  const pages = pagedOf(book)?.pages ?? []
  const filled = new Map(
    pages.filter(p => !measured.has(p.id)).map(p => [p.id, sheetsOfPage(catalog, book, p)?.filled ?? null]),
  )
  return arrangeSheets(pageSheetsOf(catalog, book, measured), {
    flow: settingValue(catalog, book, null, PRINT_PREVIEW_FLOW),
    order: settingValue(catalog, book, null, PRINT_PREVIEW_ORDER),
    shown: (page, column, row) => measured.has(page) || (filled.get(page)?.has(sheetKey(column, row)) ?? true),
  })
}

// ブック book のページ page を columns 列 × rows 行に区切ったうち、書く画面の並べ方で何も載っていない印刷区画（書く画面が暗くする。
// 改ページなど印刷のときだけの並べ直しの前で数えるので、画面に見える物と合う。判定できないタイプなら空）
export function unprintedSheets(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  columns: number,
  rows: number,
): { column: number; row: number }[] {
  const filled = sheetsOfPage(catalog, book, page, "screen")?.filled
  if (!filled) return []
  return Array.from({ length: columns * rows }, (_, i) => ({
    column: i % columns,
    row: Math.floor(i / columns),
  })).filter(c => !filled.has(sheetKey(c.column, c.row)))
}

// ブック book のページ page の初めの位置で、表示領域の左上に置く紙の点: 書く画面の並べ方で何か載っている印刷区画の、いちばん左の列と
// いちばん上の行の左上（unprintedSheets が暗くしない所）。載っている印刷区画を判定できないタイプ・何も載っていないページ・描けない紙なら紙の左上
export function startOf(catalog: CoreCatalog, book: Book, page: ItemPage): Point {
  const paper = paperSize(catalog, page)
  const sheets = sheetsOfPage(catalog, book, page, "screen")
  const filled = sheets?.filled
  if (!paper || !sheets || !filled || filled.size === 0) return { x: 0, y: 0 }
  let column = sheets.columns
  let row = sheets.rows
  for (let c = 0; c < sheets.columns; c++)
    for (let r = 0; r < sheets.rows; r++)
      if (filled.has(sheetKey(c, r))) {
        column = Math.min(column, c)
        row = Math.min(row, r)
      }
  return column === sheets.columns ? { x: 0, y: 0 } : { x: column * paper.w, y: row * paper.h }
}
