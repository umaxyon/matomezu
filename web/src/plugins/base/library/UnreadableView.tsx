// 書庫の画面で読めない物のフォルダを開いている間の右の枠: 読めない物の一覧（種類のアイコン・名前・元の場所・読めない訳・移った日時。新しい順、形に合わない物は名前だけで最後）。
// 選んだ行には「完全に消す」だけを出す（戻すのは、読めるようになれば常駐がする）。行は開けない・ドラッグできない。完全に消すのは、戻せないので確かめてから

import { useState } from "react"
import { BROKEN } from "../../../core/folders"
import { useMessages } from "../../../ui/i18n"
import { useActions } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useLibraryRows, useNameOf, usePurgeUnreadable } from "./hooks"
import { RowIcon } from "./icons"
import styles from "./LibraryView.module.css"
import { NO_TYPE, shownDateTime, type UnreadableRow, unreadableRowsOf } from "./outline"
import { type RowCell, RowTable } from "./RowTable"
import { useReasonOf } from "./reasons"

// useLibraryRows の鍵（読めない物の行）
const UNREADABLE_ROWS = "unreadable"

export function UnreadableView({
  picked,
  onPick,
}: {
  picked: string | undefined
  onPick(id: string | undefined): void
}) {
  const t = useMessages(kit)
  const rows = useLibraryRows(UNREADABLE_ROWS, (s, naming) => unreadableRowsOf(s.unreadableFolder, s, naming))
  const nameOf = useNameOf()
  const purge = usePurgeUnreadable()
  const { showToast } = useActions()
  const reasonOf = useReasonOf()
  const [purging, setPurging] = useState<UnreadableRow | null>(null)
  const cells: readonly RowCell<UnreadableRow>[] = [
    {
      head: "",
      width: "20px",
      render: row => (
        <RowIcon row={{ kind: row.shape === BROKEN ? "page" : row.kind, type: NO_TYPE }} className={styles.icon} />
      ),
    },
    {
      head: t("Name"),
      width: "minmax(0, 2fr)",
      render: row => <span className={`${styles.label} ${styles.unreadable}`}>{nameOf(row)}</span>,
    },
    {
      head: t("Was in"),
      width: "minmax(0, 1fr)",
      render: row =>
        row.shape === BROKEN ? null : (
          <span className={styles.place}>
            {row.place.trash ? t("Trash ({place})", { place: nameOf(row.place) }) : nameOf(row.place)}
          </span>
        ),
    },
    {
      head: t("Why it cannot be read"),
      width: "minmax(0, 1.5fr)",
      render: row =>
        row.shape === BROKEN ? null : <span className={styles.place}>{reasonOf(row.code, row.type)}</span>,
    },
    {
      head: t("Moved"),
      width: "max-content",
      render: row => (row.shape === BROKEN ? null : <time className={styles.when}>{shownDateTime(row.moved)}</time>),
    },
  ]
  return (
    <>
      {rows.length === 0 ? (
        <p className={styles.empty}>{t("Nothing is unreadable")}</p>
      ) : (
        <RowTable
          label={t("Unreadable")}
          cells={cells}
          rows={rows}
          picked={picked}
          onPick={onPick}
          actions={row => (
            <ActionButton danger onClick={() => setPurging(row)}>
              {t("Delete for good")}
            </ActionButton>
          )}
        />
      )}
      {purging && (
        <Confirm
          message={t('"{name}" will be deleted for good', { name: nameOf(purging) })}
          detail={
            purging.shape !== BROKEN && purging.kind !== "page"
              ? [t("Everything inside will be deleted too")]
              : undefined
          }
          ok={t("Delete for good")}
          cancel={t("Cancel")}
          onOk={() => {
            const { id } = purging
            setPurging(null)
            purge(id).then(
              () => onPick(undefined),
              () => showToast({ kind: "warn", message: kit.message("Could not delete") }),
            )
          }}
          onCancel={() => setPurging(null)}
        />
      )}
    </>
  )
}
