// 印刷区画 1 つの中身: ページの原点を印刷区画の左上にずらして、印刷区画のレイヤー（スロット sheet-layers。ブックの中身は、ブックのタイプの印刷区画 1 つのビュー printSheet）で描き、
// 中身は、見るだけのページとして描く（描いている場所は、その印刷区画のページ。中からは何も行えない。ui/scope.tsx）。
// 名前（ブック名とページ名。左上）と印刷区画の番号（下の真ん中）を中身の上に重ねる。印刷プレビューの画面と、刷る物の両方が使う（外の枠は使う側が置く）
import type { Book, Page } from "../../../core/schema/book"
import { PageScope } from "../../../ui/scope"
import styles from "./PrintPreviewView.module.css"
import type { SheetLabels } from "./print-pages"
import { Printing } from "./printing"
import { SheetLayers } from "./SheetLayers"

export interface SheetAt {
  column: number
  row: number
  w: number
  h: number
}

export function SheetFrame({
  zoom,
  book,
  page,
  sheet,
  measured,
  labels,
}: {
  zoom: number // 描いている倍率（画面の 1px に描く紙の大きさの比。刷るときは 1）
  book: Book
  page: Page | undefined
  sheet: SheetAt
  measured: unknown
  labels: SheetLabels
}) {
  return (
    <>
      {page && (
        // 印刷区画の左上が原点になるよう、ページの原点をずらす（はみ出した所は印刷区画の枠が切る）
        <div className={styles.origin} style={{ left: -sheet.column * sheet.w, top: -sheet.row * sheet.h }}>
          <Printing>
            <PageScope book={book.id} page={page.id} zoom={zoom}>
              {legacy => (
                <SheetLayers
                  stage={legacy}
                  book={book}
                  page={page}
                  column={sheet.column}
                  row={sheet.row}
                  paper={{ w: sheet.w, h: sheet.h }}
                  {...(measured !== undefined ? { measured } : {})}
                />
              )}
            </PageScope>
          </Printing>
        </div>
      )}
      {labels.title !== null && (
        <span className={styles.title} data-sheet-title>
          {labels.title}
        </span>
      )}
      {labels.number !== null && (
        <span className={styles.sheetNumber} data-sheet-number>
          {labels.number}
        </span>
      )}
    </>
  )
}
