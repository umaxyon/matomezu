// 書庫の画面の検索の結果（右の枠）: 名前に言葉を含む物の一覧（種類のアイコン・名前・置き場所）と、その後に見出し「作業履歴」で分けたワーカーブックの物。
// 書庫の物の行を押すと、その行を選び、ツリーのその行へ移る。2 回押す・Enter で開く（ツリーで今いる行を開く）。
// 作業履歴の行はツリーへ移らず、クリックで選んで「開く／分割で開く」、ダブルクリック・Enter で全画面で開く。Enter・Mod+Enter が開くのは、焦点のある
// 作業履歴の行の開く物（LIBRARY_FOUND_PICKED。書庫の物の行に焦点が移ると外す）。右クリックのメニューは出さない。
// 選んでいる行は結果の枠だけの物で、ツリーで移っても変わらない。結果の枠の何も無い所を押すと外れる。言葉を変えると、置く側が作り直して外す
import { type MouseEvent, useEffect, useState } from "react"
import { readerOf, sourceOf } from "../../../core/record-source"
import { useMessages } from "../../../ui/i18n"
import { useResetPluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { useCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { workRecordNameReadsOf, workRecordTitleOf } from "../participant/activity"
import { LIBRARY_FOUND_SCOPE } from "./commands"
import { outsideRow, useLibraryRows, useNameOf } from "./hooks"
import { RowIcon } from "./icons"
import styles from "./LibraryView.module.css"
import { type LibraryRow, tabStopOf } from "./outline"
import { RowPressOf } from "./RowPress"
import { type FoundRow, foundRowsOf, searchWord } from "./search"
import { LIBRARY_FOUND_PICKED } from "./state"
import { type WorkHistoryRow, workHistoryFoundOf } from "./work-history-search"

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
  const catalog = useCatalog().core
  const [picked, setPicked] = useState<string>()
  const setOpens = useSetPluginState(kit, LIBRARY_FOUND_PICKED)
  const resetOpens = useResetPluginState(kit, LIBRARY_FOUND_PICKED)
  // 言葉を変えた（作り直した）・検索をやめたら外す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 外すのは作り直したときと閉じたときだけ
  useEffect(() => () => resetOpens(), [])
  const rows = useLibraryRows(`found:${query}`, (s, naming) => foundRowsOf(s, query, naming))
  const workRows = useLibraryRows(`history:${query}`, (s, naming) =>
    workHistoryFoundOf(
      catalog,
      readerOf(catalog, sourceOf(s.records), workRecordNameReadsOf(catalog)),
      s,
      searchWord(query),
      naming,
    ),
  )
  const count = rows.length + workRows.length
  // Tab で止まる行（ツリーで今いる行。一覧に無ければ最初の行）
  const tabbable = tabStopOf([...rows.map(r => r.id), ...workRows.map(h => h.row.id)], current)
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 何も無い所を押して選択を外すのはポインタの操作
    // biome-ignore lint/a11y/noStaticElementInteractions: 同じ。キーでは行の間を動く
    <div
      className={styles.found}
      onClick={e => {
        if (!outsideRow(e.target)) return
        setPicked(undefined)
        resetOpens()
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
            <RowPressOf
              key={row.id}
              row={row}
              chooseOnly
              click={() => {
                setPicked(row.id)
                onPick(row)
              }}
              open={() => onOpen(row)}
            >
              {press => (
                <li>
                  {press.bubble}
                  <button
                    type="button"
                    className={styles.foundRow}
                    data-library-row={row.id}
                    data-key-scope={LIBRARY_FOUND_SCOPE}
                    data-unchoosable={press.faded || undefined}
                    tabIndex={row.id === tabbable ? 0 : -1}
                    aria-pressed={row.id === picked}
                    onFocus={() => resetOpens()}
                    onClick={press.onClick}
                    onDoubleClick={press.onDoubleClick}
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
              )}
            </RowPressOf>
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
                onPick={() => {
                  setPicked(found.row.id)
                  setOpens(found.opens.id)
                }}
                onFocus={() => setOpens(found.opens.id)}
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
// 押したとき・ダブルクリックで開くのは found.opens
function WorkHistoryEntry({
  found,
  tabbable,
  picked,
  onPick,
  onFocus,
  onOpen,
}: {
  found: WorkHistoryRow
  tabbable: boolean
  picked: boolean
  onPick(): void
  onFocus(): void
  onOpen(row: Pick<LibraryRow, "id">): void
}) {
  const nameOf = useNameOf()
  const { row, work, opens } = found
  const isBook = row.kind === "book"
  return (
    <RowPressOf row={opens} click={onPick} open={() => onOpen(opens)}>
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
            onFocus={onFocus}
            onClick={press.onClick}
            onDoubleClick={press.onDoubleClick}
            onContextMenu={e => e.preventDefault()}
          >
            <RowIcon row={row} className={styles.icon} />
            <span className={styles.label}>{isBook ? work.label : nameOf(row)}</span>
            <span className={styles.place}>{isBook ? work.name : workRecordTitleOf(work)}</span>
          </button>
        </li>
      )}
    </RowPressOf>
  )
}
