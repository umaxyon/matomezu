// 書庫の画面でゴミ箱を開いている間の右の枠: 上に「ゴミ箱を空にする」、下にゴミ箱の直下の物の一覧（種類のアイコン・名前・元の場所・捨てた日時。新しい順）。
// 選んだ行に、戻すボタン（entry-restore）と完全に消すボタン（entry-purge）を出す。捨てたフォルダ・ブックの中身は開けない（戻してから見る）。
// 戻すとき、元いたフォルダへ戻れなければ（無い・ゴミ箱の中）入る先を確かめ、入る先に同じ名前の物が在れば、番号を付けるかを確かめる。消すのは、戻せないので確かめてから。
// 完全に消す・ゴミ箱を空にするときは、消えるページを使っている所（スクラップで指しているページ）を常駐に引いてもらい、答えが来てから確かめに並べる（引いている間は、消すボタンを押せない）

import { useState } from "react"
import { titleOf, trashRefsOf } from "../../../core/entries"
import { useMessages } from "../../../ui/i18n"
import { useReadState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { Confirm, shownPlaces } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type RestorePlan, replaceBlockedOf, restorePlanOf, SAME_TITLE } from "./entries"
import { ENTRY_PURGE, ENTRY_RESTORE, TRASH_EMPTY } from "./entry-trash"
import { HistoryButtons } from "./HistoryButtons"
import { useLibraryRows, useNameOf, usePageUsers, useReadNaming } from "./hooks"
import { RowIcon } from "./icons"
import styles from "./LibraryView.module.css"
import { NO_TITLE, shownDateTime, type TrashRow, trashRowsOf } from "./outline"
import { type PageUseLine, pagesPurgedWith, pageUseLinesOf } from "./page-users"
import { type RowCell, RowTable } from "./RowTable"
import { TitleClashConfirm } from "./TitleClashConfirm"
import { useLibraryPerform } from "./useLibraryPerform"

// 確かめている事: ゴミ箱を空にする・行を消す・戻す先（元いたフォルダへ戻れない）・戻す名前（同じ名前の物が在る）
type Asking =
  | { about: "empty"; uses: Uses }
  | { about: "purge"; row: TrashRow; uses: Uses }
  | { about: "into"; row: TrashRow; plan: RestorePlan }
  | { about: "taken"; row: TrashRow; plan: RestorePlan }

// 消えるページを使っている所: 行と、全部は確かめられなかったか（some。答えられないページが在った）、確かめられなかったか（none。常駐が答えない）
type Uses = { lines: readonly PageUseLine[]; checked: "all" | "some" | "none" }

// useLibraryRows の鍵（ゴミ箱の行）
const TRASH_ROWS = "trash"

export function TrashView({ picked, onPick }: { picked: string | undefined; onPick(id: string | undefined): void }) {
  const t = useMessages(kit)
  const rows = useLibraryRows(TRASH_ROWS, trashRowsOf)
  const read = useReadState()
  const run = useLibraryPerform()
  const emptiable = useAllowedOn(TRASH_EMPTY.id, {}).ok
  const [asking, setAsking] = useState<Asking | null>(null)
  const [checking, setChecking] = useState(false)
  const nameOf = useNameOf()
  const naming = useReadNaming()
  const pageUsers = usePageUsers()
  // 消える物 entries の中のページを使っている所を引いてから、確かめ open を開く
  const askPurge = async (entries: readonly { id: string; kind: TrashRow["kind"] }[], open: (uses: Uses) => void) => {
    const targets = pagesPurgedWith(read().folders, entries)
    if (targets.length === 0) return open({ lines: [], checked: "all" })
    setChecking(true)
    try {
      const users = await pageUsers(targets)
      open({ lines: pageUseLinesOf(read(), targets, users, naming()), checked: users.sure ? "all" : "some" })
    } catch {
      open({ lines: [], checked: "none" })
    } finally {
      setChecking(false)
    }
  }
  // 確かめの文の下に足す、使っている所の行（each は、消えるページの名前も並べるか。フォルダやゴミ箱を空にするとき）
  const usesDetail = (uses: Uses, each: boolean): string[] => {
    if (uses.checked === "none") return [t("Could not check what uses it")]
    const where = (l: PageUseLine) => {
      const within = l.within
        ? l.within.backyard
          ? t("{book} ({backyard})", { book: l.within.title, backyard: l.within.backyard })
          : l.within.title
        : undefined
      return within === undefined ? l.page : `${within} › ${l.page}`
    }
    return [
      ...(uses.lines.length === 0
        ? []
        : [
            t("Used by scraps in {count} places", { count: uses.lines.length }),
            t("They will be drawn as No Data"),
            ...shownPlaces(
              uses.lines.map(l => (each ? t("{page} ← {place}", { page: l.target, place: where(l) }) : where(l))),
              count => t("{count} more places", { count }),
            ),
          ]),
      ...(uses.checked === "some" ? [t("Some pages could not be checked, so it may be used in other places too")] : []),
    ]
  }
  // 選んでいた行に行えたあと: 選んでいる行を外す
  const settle = () => onPick(undefined)
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
    const plan = restorePlanOf(read(), row.id, naming())
    if (!plan) return
    if (plan.from !== "here" && after !== "into") return setAsking({ about: "into", row, plan })
    if (plan.numbered !== SAME_TITLE) return setAsking({ about: "taken", row, plan })
    setAsking(null)
    restore(row, "refuse")
  }
  const folderName = (plan: RestorePlan) =>
    nameOf({ id: plan.into, title: titleOf(read(), "folder", plan.into, naming()) ?? NO_TITLE })
  // 表の列: 種類のアイコン・名前・元の場所・捨てた日時
  const cells: readonly RowCell<TrashRow>[] = [
    { head: "", width: "20px", render: row => <RowIcon row={row} className={styles.icon} /> },
    {
      head: t("Name"),
      width: "minmax(0, 2fr)",
      render: row => (
        <span className={row.readable ? styles.label : `${styles.label} ${styles.unreadable}`}>{nameOf(row)}</span>
      ),
    },
    {
      head: t("Returns to"),
      width: "minmax(0, 1fr)",
      render: row => <span className={styles.place}>{nameOf({ id: row.into, title: row.place })}</span>,
    },
    {
      head: t("Moved to trash"),
      width: "max-content",
      render: row => <time className={styles.when}>{shownDateTime(row.trashed)}</time>,
    },
  ]
  return (
    <>
      <div className={styles.tools}>
        <ActionButton
          danger
          disabled={rows.length === 0 || !emptiable || checking}
          onClick={() => void askPurge(trashRefsOf(read().folders), uses => setAsking({ about: "empty", uses }))}
        >
          {t("Empty trash")}
        </ActionButton>
        <HistoryButtons />
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>{t("The trash is empty")}</p>
      ) : (
        <RowTable
          label={t("Trash")}
          cells={cells}
          rows={rows}
          picked={picked}
          onPick={onPick}
          actions={row => (
            <TrashActions
              row={row}
              checking={checking}
              onRestore={() => ask(row)}
              onPurge={() => void askPurge([row], uses => setAsking({ about: "purge", row, uses }))}
            />
          )}
        />
      )}
      {asking?.about === "empty" && (
        <Confirm
          message={t("Everything in the trash will be deleted for good")}
          detail={usesDetail(asking.uses, true)}
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
          detail={[
            ...(asking.row.kind === "page" ? [] : [t("Everything inside will be deleted too")]),
            ...usesDetail(asking.uses, asking.row.kind !== "page"),
          ]}
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
function TrashActions({
  row,
  checking,
  onRestore,
  onPurge,
}: {
  row: TrashRow
  checking: boolean // 使っている所を引いている間（消すボタンを押せない）
  onRestore(): void
  onPurge(): void
}) {
  const t = useMessages(kit)
  const restorable = useAllowedOn(ENTRY_RESTORE.id, { entry: row.id, onConflict: "refuse" }).ok
  const purgeable = useAllowedOn(ENTRY_PURGE.id, { entries: [row.id] }).ok
  return (
    <>
      <ActionButton disabled={!restorable} onClick={onRestore}>
        {t("Restore")}
      </ActionButton>
      <ActionButton danger disabled={!purgeable || checking} onClick={onPurge}>
        {t("Delete for good")}
      </ActionButton>
    </>
  )
}
