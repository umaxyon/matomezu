// 郵便のダイアログ: 題・送り手・届いた時刻・本文を見せ、開いたら見たことにする（mail-seen）。行き先があれば、見出しの行の「移動」で、
// ダイアログと左サイドパネルを閉じてそのブック・ページを開き、物があれば倍率そのままで真ん中に見せる。行き先が無くなっていれば「行き先がありません」と出す
import { useEffect } from "react"
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
import { useMailAction } from "./hooks"
import own from "./Mail.module.css"
import { placeExists } from "./place"
import { shownOf } from "./shown"

export function MailDialog({ stage, args, onClose }: DialogProps<{ mail: string }>) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const mail = useMatomezuState(s => s.mailbox.find(m => m.id === args.mail) ?? null)
  const books = useMatomezuState(s => s.books)
  const act = useMailAction()
  const read = useReadState()
  const actions = useActions()
  const closeLeft = useCloseLeftSidePanel()
  const reveal = useRequestReveal()
  const seen = !!mail?.seenAt
  // 開いたら見たことにする
  useEffect(() => {
    if (mail && !seen) act(MAIL_SEEN.id, mail.id)
  }, [mail, seen, act])
  if (!mail) return null
  const shown = shownOf(catalog, mail)
  const exists = placeExists(mail, books)
  const move = () => {
    const to = mail.to
    if (!to) return
    onClose()
    closeLeft(stage)
    const opened = read().workspace.stages.find(s => s.id === stage)?.opened
    if (opened?.book !== to.book) actions.openBook(stage, to.book)
    if (to.page) actions.openPage(stage, to.page)
    if (to.ids) reveal(stage, to.ids)
    act(MAIL_VISITED.id, mail.id)
  }
  return (
    <Dialog
      title={shown?.title ?? t("Mail")}
      onClose={onClose}
      actions={
        exists ? (
          <ActionButton primary onClick={move}>
            {t("Go there")}
          </ActionButton>
        ) : undefined
      }
    >
      <p className={own.meta}>
        {mail.from} · <time>{new Date(mail.sentAt).toLocaleString()}</time>
      </p>
      {shown?.body && <p className={own.body}>{shown.body}</p>}
      {exists === false && <p className={own.gone}>{t("The place is not there")}</p>}
    </Dialog>
  )
}
