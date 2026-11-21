// 刷る物: 印刷プレビューで並べた印刷区画を、倍率 1 で、印刷区画 1 つを紙 1 枚に描く（印刷プレビューのビューが、刷れる間だけ置く）。
// 画面では見えず、刷るときだけこれを出す（画面を隠すのも PrintOutput.module.css）。紙は印刷区画の大きさの名前付きの @page で、余白 0（print-pages.ts）。
// ステージの中は倍率とずらしと切り取りが掛かり改ページが効かないので、body の直下に描き、ページのテーマの値を包み直す
import { createPortal } from "react-dom"
import type { Book, Page } from "../../../core/schema/book"
import { usePageLookStyle } from "../book-look/use-page-look-style"
import styles from "./PrintOutput.module.css"
import { pageNameOf, pageRules, type SheetLabels } from "./print-pages"
import { type SheetAt, SheetFrame } from "./SheetFrame"

export interface OutputSheet extends SheetAt {
  key: string
  page: Page | undefined
  measured: unknown
  labels: SheetLabels
}

export function PrintOutput({ book, sheets }: { stage: string; book: Book; sheets: readonly OutputSheet[] }) {
  const style = usePageLookStyle() // 外の枠は開いているページの見た目。区画の中は、区画ごとのページの見た目（SheetFrame）
  return createPortal(
    <div className={styles.output} style={style} data-print-output={sheets.length} aria-hidden="true">
      <style>{pageRules(sheets)}</style>
      {sheets.map(s => (
        <div
          key={s.key}
          className={styles.sheet}
          style={{ width: s.w, height: s.h, page: pageNameOf(s) }}
          data-print-sheet={pageNameOf(s)}
        >
          <SheetFrame zoom={1} book={book} page={s.page} sheet={s} measured={s.measured} labels={s.labels} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
