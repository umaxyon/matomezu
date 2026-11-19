// 書庫の画面の検索の結果（右の枠）: 名前に言葉を含む物の一覧（種類のアイコン・名前・置き場所）。行を押すと、ツリーのその行へ移る。2 回押すと開く
import type { MouseEvent } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { useLibraryRows, useNameOf } from "./hooks"
import { iconOf } from "./icons"
import styles from "./LibraryView.module.css"
import { type FoundRow, foundRowsOf } from "./search"

export function FoundView({
  query,
  current,
  onPick,
  onOpen,
  onMenu,
}: {
  query: string
  current: string // ツリーで今いる行
  onPick(row: FoundRow): void
  onOpen(row: FoundRow): void
  onMenu(e: MouseEvent, row: FoundRow): void
}) {
  const t = useMessages(kit)
  const nameOf = useNameOf()
  const rows = useLibraryRows(`found:${query}`, s => foundRowsOf(s, query))
  return (
    <div className={styles.found}>
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
              aria-pressed={row.id === current}
              onClick={() => onPick(row)}
              onDoubleClick={() => onOpen(row)}
              onKeyDown={e => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return
                e.preventDefault()
                onOpen(row)
              }}
              onContextMenu={e => onMenu(e, row)}
            >
              <span className={styles.icon}>{iconOf(row.kind)}</span>
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
