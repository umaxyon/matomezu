// ブックの全ページの印刷区画の数と、印刷プレビューの並べ方（ブックの設定の項目で決める）。何も載っていない印刷区画は並べない（filled.ts）
import { pagedOf } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt, settingValue } from "../book-settings"
import { growOf, pageArea, paperSize } from "../place/items"
import type { PrintSheets } from "."
import { filledSheets, sheetKey } from "./filled"
import { PRINT_PREVIEW_FLOW, PRINT_PREVIEW_ORDER } from "./settings"
import { arrangeSheets, type PageSheets, type SheetLayout } from "./sheets"

// ページ page の印刷区画: 見せ方の printSheets があればそれ、無ければ形の位置から（中身が入るだけ並べた数。base の pageArea と filledSheets。
// 載っている印刷区画を判定できないタイプは filled が null で、どの印刷区画も載っているとして扱う）
export function sheetsOfPage(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
): (Omit<PrintSheets, "filled"> & { filled: ReadonlySet<string> | null }) | null {
  const own = catalog.presentations.get(bookType(catalog, book.type).presentation)?.printSheets
  if (own) return own(catalog, page, { setting: settingsAt(catalog, book, page), grow: growOf(catalog, book, page) })
  const area = pageArea(catalog, book, page)
  return area && { columns: area.columns, rows: area.rows, filled: filledSheets(catalog, book, page) }
}

// ブック book の各ページの印刷区画（描けない紙のページは並べない）
export function pageSheetsOf(catalog: CoreCatalog, book: Book): PageSheets[] {
  return (pagedOf(book)?.pages ?? []).flatMap(page => {
    const paper = paperSize(catalog, page)
    const sheets = paper && sheetsOfPage(catalog, book, page)
    return paper && sheets ? [{ page: page.id, paper, columns: sheets.columns, rows: sheets.rows }] : []
  })
}

// ブック book を、印刷プレビューの設定の項目のとおりに並べる（何も載っていない印刷区画は並べない。何も載っていないページは並べない）
export function bookSheets(catalog: CoreCatalog, book: Book): SheetLayout {
  const pages = pagedOf(book)?.pages ?? []
  const filled = new Map(pages.map(p => [p.id, sheetsOfPage(catalog, book, p)?.filled ?? null]))
  return arrangeSheets(pageSheetsOf(catalog, book), {
    flow: settingValue(catalog, book, null, PRINT_PREVIEW_FLOW),
    order: settingValue(catalog, book, null, PRINT_PREVIEW_ORDER),
    shown: (page, column, row) => filled.get(page)?.has(sheetKey(column, row)) ?? true,
  })
}

// ブック book のページ page を columns 列 × rows 行に区切ったうち、印刷しない印刷区画（印刷プレビューに並べない物。書く画面が暗くする。
// 判定できないタイプなら空）
export function unprintedSheets(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  columns: number,
  rows: number,
): { column: number; row: number }[] {
  const filled = sheetsOfPage(catalog, book, page)?.filled
  if (!filled) return []
  return Array.from({ length: columns * rows }, (_, i) => ({
    column: i % columns,
    row: Math.floor(i / columns),
  })).filter(c => !filled.has(sheetKey(c.column, c.row)))
}
