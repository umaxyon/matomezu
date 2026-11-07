// 郵便のダイアログ: 題・送り手・届いた時刻・本文を見せ、開いたら見たことにする（mail-seen）。下の行に、行き先を開くボタンを画面の分割の状態で並べる（open-choices.ts）。
// 開くと、ダイアログと左サイドパネルを閉じてそのステージで行き先のブック・ページを開き、行き先に物があれば倍率そのままで真ん中に見せて、鳥を連れてきて枠を光らせる（bird-visit.tsx）。
// 決めるキー（Enter）は、ダイアログを出したステージで開くボタン（開いたら、そのボタンに焦点を当てる）。行き先が無い・無くなっていれば（「行き先がありません」と出す）、閉じるボタンだけを出す
import { type FormEvent, useEffect, useId, useRef } from "react"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useCloseLeftSidePanel } from "../left-side-panel/hooks"
import { useRequestReveal } from "../utils/reveal-request"
import { MAIL_SEEN, MAIL_VISITED } from "."
import { useSetBirdVisit } from "./bird-visit"
import own from "./Mail.module.css"
import { type OpenChoice, openChoices, openStageOf } from "./open-choices"
import { placeExists } from "./place"
import { shownOf } from "./shown"

const CHOICE_TITLES = {
  here: "Open",
  split: "Open in split",
  left: "Open on the left",
  right: "Open on the right",
} as const satisfies Record<OpenChoice, string>

let visits = 0 // 行き先の物を開いた回の番号（bird-visit.tsx の seq）

export function MailDialog({ stage, args, onClose }: DialogProps<{ mail: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const buttons = useRef<HTMLFormElement>(null)
  const catalog = useCoreCatalog()
  const mail = useMatomezuState(s => s.mailbox.find(m => m.id === args.mail) ?? null)
  const books = useMatomezuState(s => s.books)
  const stages = useMatomezuState(s => s.workspace.stages)
  const read = useReadState()
  const actions = useActions()
  const closeLeft = useCloseLeftSidePanel()
  const reveal = useRequestReveal()
  const bringBird = useSetBirdVisit()
  const seen = !!mail?.seenAt
  // 開いたら見たことにする
  useEffect(() => {
    if (mail && !seen) actions.perform(MAIL_SEEN.id, { mail: mail.id })
  }, [mail, seen, actions])
  // 決めるボタンに焦点を当てる（入力Form の無いダイアログでは、ブラウザが開いたときに最初のボタン〈キャンセル〉に焦点を当てるため）
  useEffect(() => {
    buttons.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
  }, [])
  if (!mail) return null
  const shown = shownOf(catalog, mail)
  const exists = placeExists(mail, books)
  const to = exists ? mail.to : undefined
  const open = (choice: OpenChoice) => {
    if (!to) return
    onClose()
    closeLeft(stage)
    if (choice === "split") actions.split(stage)
    const target = openStageOf(read().workspace, stage, choice)
    if (!target) return
    if (read().workspace.stages.find(s => s.id === target)?.opened?.book !== to.book) actions.openBook(target, to.book)
    if (to.page) actions.openPage(target, to.page)
    if (to.ids && to.ids.length > 0) {
      reveal(target, to.ids)
      bringBird(target, { mail: mail.id, seq: ++visits, book: to.book, page: to.page ?? null, ids: to.ids })
    }
    actions.perform(MAIL_VISITED.id, { mail: mail.id })
  }
  const opens = to ? openChoices({ stages }, stage) : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (opens) open(opens.primary)
    else onClose()
  }
  return (
    <Dialog title={shown?.title ?? t("Mail")} onClose={onClose}>
      <p className={own.meta}>
        {mail.from} · <time>{new Date(mail.sentAt).toLocaleString()}</time>
      </p>
      {shown?.body && <p className={own.body}>{shown.body}</p>}
      {exists === false && <p className={own.gone}>{t("The place is not there")}</p>}
      <form ref={buttons} id={form} className={own.buttons} onSubmit={submit}>
        {opens ? (
          <>
            <ActionButton onClick={onClose}>{t("Close")}</ActionButton>
            {opens.opens.map(c =>
              c === opens.primary ? (
                <ActionButton key={c} form={form} primary>
                  {t(CHOICE_TITLES[c])}
                </ActionButton>
              ) : (
                <ActionButton key={c} onClick={() => open(c)}>
                  {t(CHOICE_TITLES[c])}
                </ActionButton>
              ),
            )}
          </>
        ) : (
          <ActionButton form={form} primary>
            {t("Close")}
          </ActionButton>
        )}
      </form>
    </Dialog>
  )
}
