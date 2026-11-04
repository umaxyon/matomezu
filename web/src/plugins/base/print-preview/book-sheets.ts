// ブックの全ページの印刷区画の数と、印刷プレビューの並べ方（ブックの設定の項目で決める）
import { pagedOf } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { settingValue } from "../book-settings"
import { pageArea, paperSize } from "../place/items"
import { PRINT_PREVIEW_FLOW, PRINT_PREVIEW_ORDER } from "./settings"
import { arrangeSheets, type PageSheets, type SheetLayout } from "./sheets"

// ブック book の各ページの印刷区画（描けない紙のページは並べない）。数は、形の位置を持つページなら中身が入るだけ（base の pageArea）、
// ほかは 1 つ
export function pageSheetsOf(catalog: CoreCatalog, book: Book): PageSheets[] {
  return (pagedOf(book)?.pages ?? []).flatMap(page => {
    const paper = paperSize(catalog, page)
    const area = paper && pageArea(catalog, book, page)
    return paper && area ? [{ page: page.id, paper, columns: area.columns, rows: area.rows }] : []
  })
}

// ブック book を、印刷プレビューの設定の項目のとおりに並べる
export function bookSheets(catalog: CoreCatalog, book: Book): SheetLayout {
  return arrangeSheets(pageSheetsOf(catalog, book), {
    flow: settingValue(catalog, book, null, PRINT_PREVIEW_FLOW),
    order: settingValue(catalog, book, null, PRINT_PREVIEW_ORDER),
  })
}
