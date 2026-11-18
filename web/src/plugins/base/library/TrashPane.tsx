// 書庫の画面でゴミ箱を開いている間の右の枠: 上に「ゴミ箱を空にする」、下にゴミ箱の直下の物の一覧（種類のアイコン・名前・元の場所・捨てた日時。新しい順）。
// 選んだ行に、戻すボタン（entry-restore）と完全に消すボタン（entry-purge）を出す。捨てたフォルダ・ブックの中身は開けない（戻してから見る）。
// 戻すとき、元いたフォルダがもう無ければ入る先を確かめ、入る先に同じ名前の物が在れば、番号を付けるかを確かめる。消すのは、戻せないので確かめてから
import { useState } from "react"
import { titleOf } from "../../../core/entries"
import type { Library } from "../../../core/folders"
import { useMessages } from "../../../ui/i18n"
import { useReadState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type RestorePlan, restorePlanOf, SAME_TITLE } from "./entries"
import { ENTRY_PURGE, ENTRY_RESTORE, TRASH_EMPTY } from "./entry-trash"
import { useLibraryRows, useNameOf } from "./hooks"
import { iconOf } from "./icons"
import styles from "./LibraryView.module.css"
import { NO_TITLE, type TrashRow, trashRowsOf } from "./outline"
import { useLibraryPerform } from "./useLibraryPerform"

// 確かめている事: ゴミ箱を空にする・行を消す・戻す先（元いたフォルダへ戻れない）・戻す名前（同じ名前の物が在る）
type Asking =
  | { about: "empty" }
  | { about: "purge"; row: TrashRow }
  | { about: "into"; row: TrashRow; plan: RestorePlan }
  | { about: "taken"; row: TrashRow; plan: RestorePlan }

// 時刻 at（ISO）を、利用者の時刻の「2026-11-17 18:05」の形にする
function stamp(at: string): string {
  const d = new Date(at)
  const two = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

// ゴミ箱の行と、戻すと入るフォルダの名前 place（名前の無い物は NO_TITLE）
type PlacedRow = TrashRow & { place: string }
const TRASH_ROWS = "trash"
const placedRows = (library: Library): readonly PlacedRow[] =>
  trashRowsOf(library).map(row => ({ ...row, place: titleOf(library, "folder", row.into) ?? NO_TITLE }))

export function TrashPane({ picked, onPick }: { picked: string | undefined; onPick(id: string | undefined): void }) {
  const t = useMessages(kit)
  const rows = useLibraryRows(TRASH_ROWS, placedRows)
  const read = useReadState()
  const run = useLibraryPerform()
  const emptiable = useAllowedOn(TRASH_EMPTY.id, {}).ok
  const [asking, setAsking] = useState<Asking | null>(null)
  const nameOf = useNameOf()
  // 行 row を戻す（番号を付けるなら number）。戻せたら、選んでいる行を外す
  const restore = (row: TrashRow, number: boolean) => {
    const onConflict = number ? "number" : "refuse"
    if (run(ENTRY_RESTORE.id, { entry: row.id, onConflict }, "Could not restore")) onPick(undefined)
  }
  // 戻す前に確かめる事を、順に問う（after は、もう確かめた事）
  const ask = (row: TrashRow, after?: "into") => {
    const plan = restorePlanOf(read(), row.id)
    if (!plan) return
    if (plan.from !== "here" && after !== "into") return setAsking({ about: "into", row, plan })
    if (plan.numbered !== SAME_TITLE) return setAsking({ about: "taken", row, plan })
    setAsking(null)
    restore(row, false)
  }
  const folderName = (plan: RestorePlan) =>
    nameOf({ id: plan.into, title: titleOf(read(), "folder", plan.into) ?? NO_TITLE })
  return (
    <>
      <div className={styles.tools}>
        <ActionButton danger disabled={rows.length === 0 || !emptiable} onClick={() => setAsking({ about: "empty" })}>
          {t("Empty trash")}
        </ActionButton>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>{t("The trash is empty")}</p>
      ) : (
        <ul className={styles.trash} aria-label={t("Trash")}>
          {rows.map(row => (
            <li key={row.id} className={styles.trashed} data-picked={row.id === picked}>
              <button
                type="button"
                className={styles.trashedRow}
                aria-pressed={row.id === picked}
                onClick={() => onPick(row.id)}
              >
                <span className={styles.icon}>{iconOf(row.kind)}</span>
                <span className={row.readable ? styles.label : `${styles.label} ${styles.unreadable}`}>
                  {nameOf(row)}
                </span>
                <span className={styles.place} title={t("Returns to")}>
                  {nameOf({ id: row.into, title: row.place })}
                </span>
                <time className={styles.when} title={t("Moved to trash")}>
                  {stamp(row.trashed)}
                </time>
              </button>
              {row.id === picked && (
                <TrashActions row={row} onRestore={() => ask(row)} onPurge={() => setAsking({ about: "purge", row })} />
              )}
            </li>
          ))}
        </ul>
      )}
      {asking?.about === "empty" && (
        <Confirm
          message={t("Everything in the trash will be deleted for good")}
          ok={t("Delete for good")}
          cancel={t("Cancel")}
          onOk={() => {
            setAsking(null)
            if (run(TRASH_EMPTY.id, {}, "Could not delete")) onPick(undefined)
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking?.about === "purge" && (
        <Confirm
          message={t('"{name}" will be deleted for good', { name: nameOf(asking.row) })}
          detail={asking.row.kind === "page" ? undefined : [t("Everything inside will be deleted too")]}
          ok={t("Delete for good")}
          cancel={t("Cancel")}
          onOk={() => {
            const { row } = asking
            setAsking(null)
            if (run(ENTRY_PURGE.id, { entries: [row.id] }, "Could not delete")) onPick(undefined)
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking?.about === "into" && (
        <Confirm
          key="into"
          message={t(
            asking.plan.from === "trashed" ? "The folder it was in is in the trash" : "The folder it was in is gone",
          )}
          detail={[t('It will go to "{folder}"', { folder: folderName(asking.plan) })]}
          ok={t("Restore")}
          cancel={t("Cancel")}
          onOk={() => ask(asking.row, "into")}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking?.about === "taken" && (
        <Confirm
          key="taken"
          message={t("The name is taken")}
          detail={[
            t('"{folder}" has "{name}"', { folder: folderName(asking.plan), name: nameOf(asking.row) }),
            t('It will be "{name}"', { name: asking.plan.numbered }),
          ]}
          ok={t("Add a number")}
          cancel={t("Cancel")}
          onOk={() => {
            const { row } = asking
            setAsking(null)
            restore(row, true)
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </>
  )
}

// 選んだ行のボタン: 戻す・完全に消す（その物に行えるときだけ押せる）
function TrashActions({ row, onRestore, onPurge }: { row: TrashRow; onRestore(): void; onPurge(): void }) {
  const t = useMessages(kit)
  const restorable = useAllowedOn(ENTRY_RESTORE.id, { entry: row.id, onConflict: "refuse" }).ok
  const purgeable = useAllowedOn(ENTRY_PURGE.id, { entries: [row.id] }).ok
  return (
    <span className={styles.trashedActions}>
      <ActionButton disabled={!restorable} onClick={onRestore}>
        {t("Restore")}
      </ActionButton>
      <ActionButton danger disabled={!purgeable} onClick={onPurge}>
        {t("Delete for good")}
      </ActionButton>
    </span>
  )
}
