// 書庫の画面の検索の結果（右の枠）: 名前に言葉を含む物の一覧（種類のアイコン・名前・置き場所）と、その後に見出し「作業履歴」で分けたワーカーブックの物。
// 書庫の物の行を押すと、その行を選び、ツリーのその行へ移る。2 回押す・Enter で開く。
// 作業履歴の行はツリーへ移らず、クリックで選んで「開く／分割で開く」、ダブルクリック・Enter で全画面で開く。右クリックのメニューは出さない。
// 選んでいる行は結果の枠だけの物で、ツリーで移っても変わらない。結果の枠の何も無い所を押すと外れる。言葉を変えると、置く側が作り直して外す
import { type MouseEvent, useEffect, useRef } from "react"
import { namingOf } from "../../../core/entries"
import { readerOf, sourceOf } from "../../../core/record-source"
import { sameData } from "../../../core/same"
import { useMessages } from "../../../ui/i18n"
import { usePluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { workNameReadsOf, workTitleOf } from "../participant/activity"
import { type WorkHistoryRow, workHistoryFoundOf } from "../participant/work-history-search"
import { LIBRARY_FOUND_SCOPE } from "./commands"
import { outsideRow, useLibraryRows, useNameOf } from "./hooks"
import { RowIcon } from "./icons"
import styles from "./LibraryView.module.css"
import { type LibraryRow, tabStopOf } from "./outline"
import { RowPressOf } from "./RowPress"
import { type FoundRow, foundRowsOf, searchWord } from "./search"
import { LIBRARY_FOUND_PICKED } from "./state"

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
  onOpen(row: Pick<LibraryRow, "id">): void
  onMenu(e: MouseEvent, row: FoundRow): void
}) {
  const t = useMessages(kit)
  const nameOf = useNameOf()
  const picked = usePluginState(kit, LIBRARY_FOUND_PICKED)
  const setPicked = useSetPluginState(kit, LIBRARY_FOUND_PICKED)
  // 言葉を変えた（作り直した）・検索をやめたら外す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 外すのは作り直したときと閉じたときだけ
  useEffect(() => () => setPicked(undefined), [])
  const rows = useLibraryRows(`found:${query}`, (s, naming) => foundRowsOf(s, query, naming))
  const workRows = useWorkHistoryFound(query)
  const count = rows.length + workRows.length
  // Tab で止まる行（ツリーで今いる行。一覧に無ければ最初の行）
  const tabbable = tabStopOf([...rows.map(r => r.id), ...workRows.map(h => h.row.id)], current)
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
        {count === 0
          ? t('No name has "{word}"', { word: query })
          : t('Names with "{word}": {count}', { word: query, count })}
      </p>
      {rows.length > 0 && (
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
      )}
      {workRows.length > 0 && (
        <>
          <h3 className={styles.foundGroup}>{t("Work history")}</h3>
          <ul className={styles.foundRows} aria-label={t("Work history")}>
            {workRows.map(found => (
              <WorkHistoryEntry
                key={found.row.id}
                found={found}
                tabbable={found.row.id === tabbable}
                picked={found.row.id === picked}
                onPick={() => setPicked(found.row.id)}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// 作業履歴の行 1 つ: ブックの行は 作業のレコードの短く呼ぶ名前（チケットの番号）と名前、中の物の行は その名前と、作業のレコードの題名。
// 開くのは、ページの行はそのページ、バインダの行は中の最初のページ（found.opens）
function WorkHistoryEntry({
  found,
  tabbable,
  picked,
  onPick,
  onOpen,
}: {
  found: WorkHistoryRow
  tabbable: boolean
  picked: boolean
  onPick(): void
  onOpen(row: Pick<LibraryRow, "id">): void
}) {
  const nameOf = useNameOf()
  const { row, work, opens } = found
  const target: LibraryRow = opens === undefined ? row : { ...row, kind: "page", id: opens }
  const isBook = row.kind === "book"
  return (
    <RowPressOf row={target} click={onPick} open={() => onOpen(target)}>
      {press => (
        <li>
          {press.bubble}
          <button
            type="button"
            className={styles.foundRow}
            data-library-row={row.id}
            data-key-scope={LIBRARY_FOUND_SCOPE}
            tabIndex={tabbable ? 0 : -1}
            aria-pressed={picked}
            onFocus={onPick}
            onClick={press.onClick}
            onDoubleClick={press.onDoubleClick}
            onContextMenu={e => e.preventDefault()}
          >
            <RowIcon row={row} className={styles.icon} />
            <span className={styles.label}>{isBook ? work.label : nameOf(row)}</span>
            <span className={styles.place}>{isBook ? work.name : workTitleOf(work)}</span>
          </button>
        </li>
      )}
    </RowPressOf>
  )
}

const NO_HISTORY: readonly WorkHistoryRow[] = []

// 言葉 query で探した作業履歴の行（書庫の表・レコード・設定が変わっても、中身が同じなら同じ値のまま）
function useWorkHistoryFound(query: string): readonly WorkHistoryRow[] {
  const catalog = useCatalog().core
  const kept = useRef<{ from: readonly unknown[]; rows: readonly WorkHistoryRow[] } | null>(null)
  return useMatomezuState(s => {
    const from = [s.folders, s.pages, s.records, s.settings]
    const was = kept.current
    if (was && from.every((v, i) => v === was.from[i])) return was.rows
    const read = readerOf(catalog, sourceOf(s.records), workNameReadsOf(catalog))
    const next = workHistoryFoundOf(catalog, read, s, searchWord(query), namingOf(catalog, s.settings))
    const rows = was && sameData(was.rows, next) ? was.rows : next.length === 0 ? NO_HISTORY : next
    kept.current = { from, rows }
    return rows
  })
}
