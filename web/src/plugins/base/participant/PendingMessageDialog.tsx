// 承認待ちの AI 間メッセージの確認: 送り手と本文を見せ、承認かキャンセルを頼む。閉じるだけなら何も頼まない（吹き出しは残る）。
// 答えが返ったら（承認・キャンセル・not-pending のどれでも）閉じる。頼めなければ閉じずに、もう一度押せると知らせる。承認待ちが無くなっていれば、すぐ閉じる
import { useEffect, useRef, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useAnswerMessage, usePendingMessageById } from "./hooks"
import styles from "./PendingMessageDialog.module.css"

export function PendingMessageDialog({ args, onClose }: DialogProps<{ message: string }>) {
  const t = useMessages(kit)
  const message = usePendingMessageById(args.message)
  const answer = useAnswerMessage()
  // 頼んでいる間は二度頼まない
  const asked = useRef(false)
  const [failed, setFailed] = useState(false)
  const gone = message === undefined
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (message === undefined) return null
  const decide = (kind: "approve" | "cancel") => {
    if (asked.current) return
    asked.current = true
    setFailed(false)
    answer(message.id, kind).then(
      () => onClose(),
      () => {
        asked.current = false
        setFailed(true)
      },
    )
  }
  const sender = message.senderHostName
    ? t("{room} on host {host}", { room: message.senderRoom, host: message.senderHostName })
    : message.senderRoom
  return (
    <Dialog title={t("Message waiting for approval")} width={520} onClose={onClose}>
      <p className={styles.sender}>{t("Sender: {name}", { name: sender })}</p>
      <p className={styles.body}>{message.body}</p>
      {failed ? <p className={styles.warn}>{t("The answer could not be sent")}</p> : null}
      <div className={styles.buttons}>
        <ActionButton onClick={() => decide("cancel")}>{t("Cancel")}</ActionButton>
        <ActionButton onClick={() => decide("approve")}>{t("Approve")}</ActionButton>
      </div>
    </Dialog>
  )
}
