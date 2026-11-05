// 印刷区画 1 つの中身: ページの原点を印刷区画の左上にずらして、ブックのタイプの印刷区画 1 つのビュー（printSheet）で描き、
// ブック名（左上）とページ番号（下の真ん中）を中身の上に重ねる。印刷プレビューの画面と、刷る物の両方が使う（外の枠は使う側が置く）
import type { ComponentType } from "react"
import type { Book, Page } from "../../../core/schema/book"
import type { PrintSheetProps } from "./PrintPreviewView"
import styles from "./PrintPreviewView.module.css"
import { PrintingContext } from "./printing"

export interface SheetAt {
  column: number
  row: number
  w: number
  h: number
}

export function SheetFrame({
  stage,
  book,
  page,
  sheet,
  Sheet,
  measured,
  labels,
}: {
  stage: string
  book: Book
  page: Page | undefined
  sheet: SheetAt
  Sheet: ComponentType<PrintSheetProps> | undefined
  measured: unknown
  labels: { number: string | null; book: string | null }
}) {
  return (
    <>
      {Sheet && page && (
        // 印刷区画の左上が原点になるよう、ページの原点をずらす（はみ出した所は印刷区画の枠が切る）
        <div className={styles.origin} style={{ left: -sheet.column * sheet.w, top: -sheet.row * sheet.h }}>
          <PrintingContext.Provider value={true}>
            <Sheet
              stage={stage}
              book={book}
              page={page}
              column={sheet.column}
              row={sheet.row}
              paper={{ w: sheet.w, h: sheet.h }}
              {...(measured !== undefined ? { measured } : {})}
            />
          </PrintingContext.Provider>
        </div>
      )}
      {labels.book !== null && (
        <span className={styles.bookName} data-sheet-book-name>
          {labels.book}
        </span>
      )}
      {labels.number !== null && (
        <span className={styles.pageNumber} data-sheet-number>
          {labels.number}
        </span>
      )}
    </>
  )
}
