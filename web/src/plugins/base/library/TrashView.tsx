// 書庫の画面でゴミ箱を開いている間の右の枠: 上に「ゴミ箱を空にする」、下にゴミ箱の直下の物の一覧（種類のアイコン・名前・元の場所・捨てた日時。新しい順）。
// 選んだ行に、戻すボタン（entry-restore）と完全に消すボタン（entry-purge）を出す。捨てたフォルダ・ブックの中身は開けない（戻してから見る）。
// 戻すとき、元いたフォルダへ戻れなければ（無い・ゴミ箱の中）入る先を確かめ、入る先に同じ名前の物が在れば、番号を付けるかを確かめる。消すのは、戻せないので確かめてから
import { useEffect, useState } from "react"
import { titleOf } from "../../../core/entries"
import { useMessages } from "../../../ui/i18n"
import { useReadState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type RestorePlan, replaceBlockedOf, restorePlanOf, SAME_TITLE } from "./entries"
import { ENTRY_PURGE, ENTRY_RESTORE, TRASH_EMPTY } from "./entry-trash"
import { useLibraryRows, useNameOf } from "./hooks"
import { iconOf } from "./icons"
import styles from "./LibraryView.module.css"
import { NO_TITLE, shownDateTime, type TrashRow, trashRowsOf } from "./outline"
import { TitleClashConfirm } from "./TitleClashConfirm"
import { useLibraryPerform } from "./useLibraryPerform"

// 確かめている事: ゴミ箱を空にする・行を消す・戻す先（元いたフォルダへ戻れない）・戻す名前（同じ名前の物が在る）
type Asking =
  | { about: "empty" }
  | { about: "purge"; row: TrashRow }
  | { about: "into"; row: TrashRow; plan: RestorePlan }
  | { about: "taken"; row: TrashRow; plan: RestorePlan }

// useLibraryRows の鍵（ゴミ箱の行）
const TRASH_ROWS = "trash"

export function TrashView({
  picked,
  onPick,
  onSettled,
}: {
  picked: string | undefined
  onPick(id: string | undefined): void
  onSettled(): void // 選んでいた行に行えて、その行が消えたあと（焦点を置き直す所）
}) {
  const t = useMessages(kit)
  const rows = useLibraryRows(TRASH_ROWS, trashRowsOf)
  const read = useReadState()
  const run = useLibraryPerform()
  const emptiable = useAllowedOn(TRASH_EMPTY.id, {}).ok
  const [asking, setAsking] = useState<Asking | null>(null)
  const nameOf = useNameOf()
  // 選んでいた行に行えたあと: 選んでいる行を外し、行と一緒に消えたボタンの代わりに、焦点を置き直してもらう
  const [settled, setSettled] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 行えた回ごとに 1 度だけ呼ぶ
  useEffect(() => {
    if (settled > 0) onSettled()
  }, [settled])
  const settle = () => {
    onPick(undefined)
    setSettled(n => n + 1)
  }
  // 行 row を戻す。how は、同じ名前の物が在るときの戻し方: 断らせる（refuse）・番号を付ける（number）・確かめた plan のとおりに上書きする
  const restore = (row: TrashRow, how: "refuse" | "number" | RestorePlan) => {
    const args =
      typeof how === "string"
        ? { entry: row.id, onConflict: how }
        : { entry: row.id, onConflict: "replace", replaces: how.replaces }
    if (run(ENTRY_RESTORE.id, args, "Could not restore")) settle()
  }
  // 戻す前に確かめる事を、順に問う（after は、もう確かめた事）
  const ask = (row: TrashRow, after?: "into") => {
    const plan = restorePlanOf(read(), row.id)
    if (!plan) return
    if (plan.from !== "here" && after !== "into") return setAsking({ about: "into", row, plan })
    if (plan.numbered !== SAME_TITLE) return setAsking({ about: "taken", row, plan })
    setAsking(null)
    restore(row, "refuse")
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
                  {shownDateTime(row.trashed)}
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
            if (run(TRASH_EMPTY.id, {}, "Could not delete")) settle()
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
            if (run(ENTRY_PURGE.id, { entries: [row.id] }, "Could not delete")) settle()
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
        <RestoreClash
          row={asking.row}
          plan={asking.plan}
          folder={folderName(asking.plan)}
          name={nameOf(asking.row)}
          onChoose={how => {
            const { row, plan } = asking
            setAsking(null)
            if (how !== "cancel") restore(row, how === "number" ? "number" : plan)
          }}
        />
      )}
    </>
  )
}

// 戻す先に同じ名前の物が在るときの確かめ（上書きできるかは、確かめた plan の訳と、上書きのアクションを止める認可ステップから出す）
function RestoreClash({
  row,
  plan,
  folder,
  name,
  onChoose,
}: {
  row: TrashRow
  plan: RestorePlan
  folder: string
  name: string
  onChoose(how: "number" | "replace" | "cancel"): void
}) {
  const allowed = useAllowedOn(ENTRY_RESTORE.id, { entry: row.id, onConflict: "replace", replaces: plan.replaces })
  return (
    <TitleClashConfirm
      folder={folder}
      name={name}
      numbered={plan.numbered}
      blocked={replaceBlockedOf(plan, allowed)}
      onNumber={() => onChoose("number")}
      onReplace={() => onChoose("replace")}
      onCancel={() => onChoose("cancel")}
    />
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
