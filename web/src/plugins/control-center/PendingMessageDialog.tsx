// 承認待ちの AI 間メッセージの確認: 送り手と本文を見せ、承認かキャンセルを頼む。閉じるのはキャンセルと同じ。
// 答えが返ったら（承認・キャンセル・not-pending のどれでも）閉じる。頼めなければ閉じずに、もう一度押せると知らせる。承認待ちが無くなっていれば、すぐ閉じる
import { useEffect, useRef, useState } from "react"
import type { DialogProps } from "../../plugin-api/ui"
import { useMessages } from "../../plugin-api/ui"
import { ActionButton, Dialog, useAnswerMessage, useParticipantLabel, usePendingMessageById } from "../base/ui"
import { kit } from "./kit"
import styles from "./PendingMessageDialog.module.css"

export function PendingMessageDialog({ args, onClose }: DialogProps<{ message: string }>) {
  const t = useMessages(kit)
  const message = usePendingMessageById(args.message)
  const answer = useAnswerMessage()
  const label = useParticipantLabel(message?.sender ?? "")
  // 頼んでいる間は二度頼まない（閉じるのも、承認・キャンセルの答えを待つ間は同じ頼みにする）
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
  const sender = message.senderHost ? `${message.senderHost} / ${label}` : label
  return (
    <Dialog title={t("Message waiting for approval")} width={520} onClose={() => decide("cancel")}>
      <p className={styles.sender}>{t("Sender: {name}", { name: sender })}</p>
      <p className={styles.body}>{message.body}</p>
      {failed ? <p className={styles.warn}>{t("The answer could not be sent. Try again.")}</p> : null}
      <div className={styles.buttons}>
        <ActionButton onClick={() => decide("cancel")}>{t("Cancel")}</ActionButton>
        <ActionButton onClick={() => decide("approve")}>{t("Approve")}</ActionButton>
      </div>
    </Dialog>
  )
}
