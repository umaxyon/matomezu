// 変更提案郵便のダイアログの下の行: 場所を示す（郵便を閉じずに窓の右の端に寄せ、ダイアログを出したステージで行き先を開き、当たる物を真ん中に見せて鳥を連れてくる）と、
// 反映（proposal-apply を行い、常駐の答えを待つ。行えなければ押せない）。反映できたら反映したと残して郵便を閉じる。どこかの窓で当たる物を直していたら断られ（being-edited）、
// トーストで知らせて郵便は残す（直し終えてから押せる）。送ったあとに当たる物が変わっていた・変更が断られたなら、失敗したと残してトーストで知らせ、反映は押せなくなる。
// 反映した・失敗した郵便は、ボタンを出さずに、その時刻を出す
import { screenOf } from "../../../core/window"
import { useMessages } from "../../../ui/i18n"
import { useActions, useReadState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useRequestReveal } from "../utils/reveal-request"
import { MAIL_VISITED } from "."
import { useSetBirdVisit } from "./bird-visit"
import own from "./Mail.module.css"
import { PROPOSAL_APPLY, PROPOSAL_SETTLE, type ProposalProps, proposalChanged, proposalOf } from "./proposal"
import type { MailActionsProps } from "./slots"

let visits = 0 // 場所を示した回の番号（bird-visit.tsx の seq。開くボタンとは別に数える）

// 形の合わない郵便（郵便箱には残る）には、ボタンを出さない
export function ProposalActions(at: MailActionsProps) {
  const props = proposalOf(at.mail)
  return props ? <Proposal {...at} props={props} /> : null
}

function Proposal({ stage, mail, onClose, dock, props }: MailActionsProps & { props: ProposalProps }) {
  const t = useMessages(kit)
  const actions = useActions()
  const read = useReadState()
  const reveal = useRequestReveal()
  const bringBird = useSetBirdVisit()
  const applyArgs = { ...(props.page ? { page: props.page } : {}), changes: props.changes, snapshot: props.snapshot }
  // 反映を行えなければ（ブックのロック中など）、反映を押せなくする
  const applicable = useAllowedOn(PROPOSAL_APPLY.id, applyArgs, { book: props.book }).ok
  if (props.appliedAt)
    return (
      <p className={own.meta}>
        {t("Applied")} · <time>{new Date(props.appliedAt).toLocaleString()}</time>
      </p>
    )
  if (props.failedAt)
    return (
      <p className={own.meta}>
        {t("Could not apply")} · <time>{new Date(props.failedAt).toLocaleString()}</time>
      </p>
    )
  const showPlace = () => {
    const to = mail.to
    if (!to) return
    dock()
    actions.showBookScreen()
    if (screenOf(read().window).stages.find(s => s.id === stage)?.opened?.book !== to.book)
      actions.openBook(stage, to.book)
    if (to.page) actions.openPage(stage, to.page)
    if (to.ids && to.ids.length > 0) {
      reveal(stage, to.ids)
      bringBird(stage, { mail: mail.id, seq: ++visits, book: to.book, page: to.page ?? null, ids: to.ids })
    }
    if (!mail.visitedAt) actions.perform(MAIL_VISITED.id, {}, { record: mail.id })
  }
  const apply = async () => {
    const done = await actions.performConfirmed(PROPOSAL_APPLY.id, applyArgs, { book: props.book })
    if (done.ok) {
      actions.perform(PROPOSAL_SETTLE.id, { outcome: "applied" }, { record: mail.id })
      onClose()
      return
    }
    if (done.reason === "being-edited") {
      actions.showToast({
        kind: "warn",
        message: kit.message("It is being edited"),
        detail: { message: kit.message("Apply after finishing the edit") },
      })
      return
    }
    const book = read().books[props.book]
    const changed = book ? proposalChanged(book, props.snapshot) : Object.keys(props.snapshot)
    actions.perform(PROPOSAL_SETTLE.id, { outcome: "failed", changed }, { record: mail.id })
    actions.showToast({
      kind: "warn",
      message: kit.message("Could not apply"),
      detail: {
        message: changed.length > 0 ? kit.message("Changed after it was sent") : kit.message("A change was refused"),
      },
    })
  }
  return (
    <>
      <ActionButton onClick={showPlace} disabled={!mail.to}>
        {t("Show the place")}
      </ActionButton>
      <ActionButton primary onClick={() => void apply()} disabled={!applicable}>
        {t("Apply")}
      </ActionButton>
    </>
  )
}
