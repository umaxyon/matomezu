// ブックの全ページの印刷区画の数と、印刷プレビューの並べ方（ブックの設定の項目で決める）。何も載っていない印刷区画は並べない（filled.ts）
import { pagedOf } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingValue } from "../book-settings"
import { pageArea, paperSize } from "../place/items"
import { filledSheets, sheetKey } from "./filled"
import { PRINT_PREVIEW_FLOW, PRINT_PREVIEW_ORDER } from "./settings"
import { arrangeSheets, type PageSheets, pickedSheets, type SheetLayout } from "./sheets"

// ブック book の各ページの印刷区画（描けない紙のページは並べない）。数は、形の位置を持つページなら中身が入るだけ（base の pageArea）、
// ほかは 1 つ
export function pageSheetsOf(catalog: CoreCatalog, book: Book): PageSheets[] {
  return (pagedOf(book)?.pages ?? []).flatMap(page => {
    const paper = paperSize(catalog, page)
    const area = paper && pageArea(catalog, book, page)
    return paper && area ? [{ page: page.id, paper, columns: area.columns, rows: area.rows }] : []
  })
}

// ブック book を、印刷プレビューの設定の項目のとおりに並べる（何も載っていない印刷区画は並べない。どれも空のページは白紙 1 枚）
export function bookSheets(catalog: CoreCatalog, book: Book): SheetLayout {
  const pages = pagedOf(book)?.pages ?? []
  const filled = new Map(pages.map(p => [p.id, filledSheets(catalog, book, p)]))
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
  const paper = paperSize(catalog, page)
  const filled = filledSheets(catalog, book, page)
  if (!paper || !filled) return []
  const order = settingValue(catalog, book, null, PRINT_PREVIEW_ORDER)
  const printed = new Set(
    pickedSheets({ page: page.id, paper, columns, rows }, order, (_, column, row) =>
      filled.has(sheetKey(column, row)),
    ).map(c => sheetKey(c.column, c.row)),
  )
  return Array.from({ length: columns * rows }, (_, i) => ({
    column: i % columns,
    row: Math.floor(i / columns),
  })).filter(c => !printed.has(sheetKey(c.column, c.row)))
}
