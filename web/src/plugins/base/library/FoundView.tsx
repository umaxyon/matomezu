// 書庫の画面の検索の結果（右の枠）: 名前に言葉を含む物の一覧（種類のアイコン・名前・置き場所）。行を押すと、その行を選び、ツリーのその行へ移る。2 回押す・Enter で開く。
// 選んでいる行は結果の枠だけの物で、ツリーで移っても変わらない。結果の枠の何も無い所を押すと外れる。言葉を変えると、置く側が作り直して外す
import { type MouseEvent, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { LIBRARY_FOUND_SCOPE } from "./commands"
import { outsideRow, useLibraryRows, useNameOf } from "./hooks"
import { RowIcon } from "./icons"
import styles from "./LibraryView.module.css"
import { tabStopOf } from "./outline"
import { type FoundRow, foundRowsOf } from "./search"

export function FoundView({
  query,
  current,
  onPick,
  onOpen,
  onMenu,
}: {
  query: string
  current: string // ツリーで今いる行（Tab で止まる行を決める）
  onPick(row: FoundRow): void
  onOpen(row: FoundRow): void
  onMenu(e: MouseEvent, row: FoundRow): void
}) {
  const t = useMessages(kit)
  const nameOf = useNameOf()
  const [picked, setPicked] = useState<string>()
  const rows = useLibraryRows(`found:${query}`, (s, naming) => foundRowsOf(s, query, naming))
  // Tab で止まる行（ツリーで今いる行。一覧に無ければ最初の行）
  const tabbable = tabStopOf(
    rows.map(r => r.id),
    current,
  )
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 何も無い所を押して選択を外すのはポインタの操作
    // biome-ignore lint/a11y/noStaticElementInteractions: 同じ。キーでは行の間を動く
    <div
      className={styles.found}
      onClick={e => {
        if (outsideRow(e.target)) setPicked(undefined)
      }}
    >
      <p className={styles.foundHead} role="status">
        {rows.length === 0
          ? t('No name has "{word}"', { word: query })
          : t('Names with "{word}": {count}', { word: query, count: rows.length })}
      </p>
      <ul className={styles.foundRows} aria-label={t("Found")}>
        {rows.map(row => (
          <li key={row.id}>
            <button
              type="button"
              className={styles.foundRow}
              data-library-row={row.id}
              data-key-scope={LIBRARY_FOUND_SCOPE}
              tabIndex={row.id === tabbable ? 0 : -1}
              aria-pressed={row.id === picked}
              onClick={() => {
                setPicked(row.id)
                onPick(row)
              }}
              onDoubleClick={() => onOpen(row)}
              onContextMenu={e => {
                setPicked(row.id)
                onMenu(e, row)
              }}
            >
              <RowIcon row={row} className={styles.icon} />
              <span className={row.readable ? styles.label : `${styles.label} ${styles.unreadable}`}>
                {nameOf(row)}
              </span>
              <span className={styles.place}>{row.place.join(" › ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
