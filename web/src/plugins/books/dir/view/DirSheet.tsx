// ディレクトリ構成図の紙 1 枚のビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの行と罫線と説明を、書く画面と同じ並べ方
// （print.ts の laidPage）で、見るだけで描く。全体を描いて、受け取った印刷区画の左上が原点になるようにずらす（はみ出した所は外の印刷区画の枠が切る）。
// 入力を受けず、開け閉めのボタンや選んだ印、e2e や操作が探す印（data-entry など）も付けない
import { useCoreCatalog } from "../../../../plugin-api/ui"
import { growOf, pageContext } from "../../../base"
import { type PrintSheetProps, RichText } from "../../../base/ui"
import { laidPage } from "../print"
import { paint, RowFace } from "./DirView"
import styles from "./DirView.module.css"

export function DirSheet({ book, page, column, row, paper }: PrintSheetProps) {
  const catalog = useCoreCatalog()
  const laid = laidPage(catalog, page, {
    setting: pageContext(catalog, book, page).setting,
    grow: growOf(catalog, book, page),
  })
  if (!laid) return null
  const { rows, lines, notes, divider } = laid
  return (
    <div className={styles.sheet} style={{ left: -column * paper.w, top: -row * paper.h }}>
      <svg className={styles.lines} width={paper.w} height={paper.h} aria-hidden="true">
        {lines.map(l => (
          <path
            key={`${l.from.x},${l.from.y}-${l.to.x},${l.to.y}`}
            d={`M${l.from.x} ${l.from.y}L${l.to.x} ${l.to.y}`}
          />
        ))}
        {divider && <path d={`M${divider.from.x} ${divider.from.y}L${divider.to.x} ${divider.to.y}`} />}
      </svg>
      {rows.map(r => (
        <div
          key={r.id}
          className={styles.row}
          data-kind={r.kind}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h, ...paint(r.color) }}
        >
          <RowFace row={r} />
        </div>
      ))}
      {notes &&
        rows.map(r =>
          r.note ? (
            <span
              key={`note-${r.id}`}
              className={styles.note}
              style={{ left: notes.x, top: r.y, maxWidth: notes.w, height: r.h }}
            >
              <RichText line={r.note} />
            </span>
          ) : null,
        )}
    </div>
  )
}
