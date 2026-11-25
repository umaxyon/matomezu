// 承認待ちの AI 間メッセージの吹き出し: 受け手の参加者の行の名前の下に出す、点滅する「!」。押すと、いちばん古い承認待ちの確認のダイアログを開く。承認待ちが無ければ何も出さない
import { useActions, useMessages } from "../../plugin-api/ui"
import { usePendingMessageFor } from "../base/ui"
import { PENDING_MESSAGE_DIALOG } from "./control-center"
import { kit } from "./kit"
import styles from "./PendingBalloon.module.css"

export function PendingBalloon({ receiver }: { receiver: string }) {
  const t = useMessages(kit)
  const { openDialog } = useActions()
  const message = usePendingMessageFor(receiver)
  if (message === undefined) return null
  return (
    <button
      type="button"
      className={styles.balloon}
      aria-label={t("Message waiting for approval")}
      title={t("Message waiting for approval")}
      onClick={() => openDialog(PENDING_MESSAGE_DIALOG.id, { message: message.id })}
    >
      !
    </button>
  )
}
