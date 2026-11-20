// 郵便のダイアログ: 題・送り手・届いた時刻・本文を見せ、開いたら見たことにする（mail-seen）。下の行に、行き先を開くボタンを画面の分割の状態で並べる（open-choices.ts）。
// 「開く」は、ダイアログを閉じて行き先のブックを窓に出し（もう開いていればそのブックスクリーンをカレントに、無ければ新しいブックスクリーン）、分けて開く・左右に開くは、ダイアログを出したステージの並びのそのステージに開く（左サイドパネルは開いていれば、そのまま残す）。
// 行き先に物があれば倍率そのままで真ん中に見せて、鳥を連れてきて枠を光らせる（bird-visit.tsx）。郵便箱のタブが開いているときは、ダイアログと郵便箱を一緒に閉じるボタンも出す。
// 決めるキー（Enter）は、ダイアログを出したステージで開くボタン（開いたら、そのボタンに焦点を当てる）。行き先が無い・無くなっていれば（「行き先がありません」と出す）、閉じるボタンだけを出す

import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react"
import type { Stage } from "../../../core/stage"
import { screenOfStage } from "../../../core/window"
import { NO_STAGE } from "../../../store/dialogs"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useLayout, useMatomezuState, useReadState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useCloseLeftSidePanel, useLeftSidePanel } from "../left-side-panel/hooks"
import { MAIL_SEEN, MAIL_VISITED } from "."
import { useMailbox, useShowMailPlaceAt } from "./hooks"
import own from "./Mail.module.css"
import { type OpenChoice, type OpenChoices, openChoices, openStageOf } from "./open-choices"
import { placeExists } from "./place"
import { shownOf } from "./shown"
import { MAIL_ACTIONS, type MailActionsProps } from "./slots"
import { MAILBOX_TAB_ID } from "./tab-id"

const CHOICE_TITLES = {
  here: "Open",
  split: "Open in split",
  left: "Open on the left",
  right: "Open on the right",
} as const satisfies Record<OpenChoice, string>

// ボタンが 4 つ並んでも（英語の「Close the mailbox too」「Open on the left」「Open on the right」を含め）1 行に収まる幅。ダイアログの既定の幅 360 には収まらない
const DIALOG_WIDTH = 620
const NO_STAGES: Stage[] = []
// ステージを持たずに出したダイアログの開くボタン（ブックを窓に出す 1 つ）
const WINDOW_CHOICES: OpenChoices = { opens: ["here"], primary: "here" }

export function MailDialog({ args, onClose }: DialogProps<{ mail: string }>) {
  // 開いた場所（ステージか、ステージを持たないスクリーン）。行き先を開くステージを、ここから決める
  const stage = useMatomezuState(s => s.dialog?.stage ?? "")
  const t = useMessages(kit)
  const form = useId()
  const buttons = useRef<HTMLFormElement>(null)
  const catalog = useCoreCatalog()
  const mail = useMailbox().find(m => m.id === args.mail) ?? null
  const books = useMatomezuState(s => s.books)
  // ダイアログを出したステージを並べているブックスクリーンのステージ（ステージを持たずに出したなら、無い）
  const stages = useMatomezuState(s => screenOfStage(s.window, stage)?.stages.stages ?? NO_STAGES)
  const read = useReadState()
  const actions = useStoreActions()
  const closeLeft = useCloseLeftSidePanel()
  const left = useLeftSidePanel()
  const mailboxOpened = left?.tab === MAILBOX_TAB_ID
  const showPlace = useShowMailPlaceAt()
  const seen = !!mail?.seenAt
  const [docked, setDocked] = useState(false) // 窓の右の端に寄せているか（種類のボタンが頼む）
  // この種類のボタンのウィジェット（あれば、開くボタンの代わりにそのボタンを並べる）
  const placed: readonly string[] = useLayout().slots[MAIL_ACTIONS] ?? []
  const uiWidgets = useUiCatalog().widgets
  const actionsId = mail ? placed.find(w => uiWidgets.get(w)?.forKind === mail.mail) : undefined
  const Actions = actionsId
    ? (uiWidgets.get(actionsId)?.view as ((props: MailActionsProps) => ReactNode) | undefined)
    : undefined
  // 開いたら見たことにする
  useEffect(() => {
    if (mail && !seen) actions.perform(MAIL_SEEN.id, {}, { record: mail.id })
  }, [mail, seen, actions])
  // 決めるボタンに焦点を当てる（入力Form の無いダイアログでは、ブラウザが開いたときに最初のボタン〈キャンセル〉に焦点を当てるため）
  useEffect(() => {
    buttons.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
  }, [])
  if (!mail) return null
  const shown = shownOf(catalog, mail, t)
  const exists = placeExists(mail, books)
  const to = exists ? mail.to : undefined
  const open = (choice: OpenChoice) => {
    if (!to) return
    onClose()
    if (choice === "split") actions.split(stage)
    const ws = screenOfStage(read().window, stage)?.stages
    // 「開く」は、ブックを窓に出す（もう開いていればカレントスクリーンにし、無ければ新しいブックスクリーン。見ていたブックは差し替えない）。
    // 分けて開く・左右に開くは、ダイアログを出したステージの並びの、そのステージに開く
    const inWindow = choice === "here" || !ws
    const target = inWindow ? actions.showBookStage(to.book) : openStageOf(ws, stage, choice)
    if (!target || target === NO_STAGE) return
    showPlace(target, mail)
    actions.perform(MAIL_VISITED.id, {}, { record: mail.id })
  }
  const opens = to && !Actions ? (openChoices({ stages }, stage) ?? WINDOW_CHOICES) : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (opens) open(opens.primary)
    else onClose()
  }
  const closeBoth = mailboxOpened && left && (
    <ActionButton
      onClick={() => {
        onClose()
        closeLeft()
      }}
    >
      {t("Close the mailbox too")}
    </ActionButton>
  )
  return (
    <Dialog title={shown?.title ?? t("Mail")} width={DIALOG_WIDTH} docked={docked} onClose={onClose}>
      <p className={own.meta}>
        {mail.from} · <time>{new Date(mail.sentAt).toLocaleString()}</time>
      </p>
      {shown?.body && <p className={own.body}>{shown.body}</p>}
      {exists === false && <p className={own.gone}>{t("The place is not there")}</p>}
      <form ref={buttons} id={form} className={own.buttons} onSubmit={submit}>
        {Actions ? (
          <>
            <ActionButton onClick={onClose}>{t("Close")}</ActionButton>
            <Actions mail={mail} onClose={onClose} dock={() => setDocked(true)} />
          </>
        ) : opens ? (
          <>
            {closeBoth}
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
          <>
            {closeBoth}
            <ActionButton form={form} primary>
              {t("Close")}
            </ActionButton>
          </>
        )}
      </form>
    </Dialog>
  )
}
