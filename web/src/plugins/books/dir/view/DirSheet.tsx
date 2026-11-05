// ディレクトリ構成図の印刷区画 1 つのビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの行と罫線と説明を、書く画面と同じ並べ方
// （print.ts の printLaid。可変ページでは境目をまたぐ行を次の印刷区画へ送る）で、見るだけで、ページの原点で描く。
// 入力を受けず、開け閉めのボタンや選んだ印、e2e や操作が探す印（data-entry など）も付けない
import { useCoreCatalog } from "../../../../plugin-api/ui"
import { growOf, pageContext } from "../../../base"
import { type PrintSheetProps, RichText } from "../../../base/ui"
import { printLaid } from "../print"
import { paint, RowFace } from "./DirView"
import styles from "./DirView.module.css"

export function DirSheet({ book, page, paper }: PrintSheetProps) {
  const catalog = useCoreCatalog()
  const laid = printLaid(catalog, page, {
    setting: pageContext(catalog, book, page).setting,
    grow: growOf(catalog, book, page),
  })
  if (!laid) return null
  const { rows, lines, notes, divider } = laid
  return (
    <>
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
    </>
  )
}
