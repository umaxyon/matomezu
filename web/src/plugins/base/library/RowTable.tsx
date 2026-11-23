// 書庫の画面の右の枠で行を選ぶ一覧の枠と、その上に組んだ表。
// usePickRows は、普通のフォルダの中身・ゴミ箱・読めない物のフォルダが共に使う、行を選ぶ枠（矢印キーの範囲・行の外の矢印キーの範囲・Tab で止まる行・選んでいる行・何も無い所を押すと外す・列の数を測る）。
// 矢印キーのコマンド library-pick-move は、同じ行の順を paneIdsOf から読む。RowTable は、ゴミ箱と読めない物のフォルダの表の形（見出しの行・列・選んだ行のボタン）
import type { MouseEvent, ReactNode } from "react"
import { useColumnsMeasure } from "./arrows"
import { LIBRARY_CONTENTS_AROUND_SCOPE, LIBRARY_CONTENTS_SCOPE } from "./commands"
import { outsideRow } from "./hooks"
import styles from "./LibraryView.module.css"
import { tabStopOf } from "./outline"

// 見せる順の行 ids のうち、選んでいる行 picked を onPick で選び直す枠: 一覧の要素に付ける list と、行のボタンに付ける row(id)
export function usePickRows(
  ids: readonly string[],
  picked: string | undefined,
  onPick: (id: string | undefined) => void,
) {
  const measure = useColumnsMeasure(ids.length)
  const stop = tabStopOf(ids, picked)
  return {
    list: {
      ref: measure,
      // 行の外（余白）を押したら、一覧が焦点を受ける（矢印だけが効く。矢印で選んだ行へ LibraryView が焦点を移す）
      "data-key-scope": LIBRARY_CONTENTS_AROUND_SCOPE,
      tabIndex: -1,
      // 何も無い所（行の外）を押すと、選んでいる行を外す
      onClick: (e: MouseEvent) => {
        if (outsideRow(e.target)) onPick(undefined)
      },
    },
    row: (id: string) => ({
      "data-library-row": id,
      "data-key-scope": LIBRARY_CONTENTS_SCOPE,
      tabIndex: id === stop ? 0 : -1,
      "aria-pressed": id === picked,
      onClick: () => onPick(id),
    }),
  }
}

// 表の列 1 つ: 見出し head（無ければ空の文字列）・幅 width（CSS の grid の列の幅）・行 1 つの中身
export interface RowCell<R> {
  head: string
  width: string
  render(row: R): ReactNode
}

export function RowTable<R extends { id: string }>({
  label,
  cells,
  rows,
  picked,
  onPick,
  actions,
}: {
  label: string // 一覧の名前（読み上げ）
  cells: readonly RowCell<R>[]
  rows: readonly R[] // 見せる順
  picked: string | undefined
  onPick(id: string | undefined): void
  actions(row: R): ReactNode // 選んだ行の下に出すボタン
}) {
  const pick = usePickRows(
    rows.map(r => r.id),
    picked,
    onPick,
  )
  return (
    <div className={styles.table} style={{ gridTemplateColumns: cells.map(c => c.width).join(" ") }}>
      <div className={styles.tableHead}>
        {cells.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 列は定まった並びで、入れ替わらない
          <span key={i}>{c.head}</span>
        ))}
      </div>
      <ul className={styles.tableRows} aria-label={label} {...pick.list}>
        {rows.map(row => (
          <li key={row.id} className={styles.tableRow} data-picked={row.id === picked}>
            <button type="button" className={styles.tableRowButton} {...pick.row(row.id)}>
              {cells.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同じ
                <span key={i} className={styles.tableCell}>
                  {c.render(row)}
                </span>
              ))}
            </button>
            {row.id === picked && (
              // 選んだ行のボタンは行の内側（押しても、選んでいる行を外さない）
              <span className={styles.tableActions} data-library-row-actions="">
                {actions(row)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
