// 参加要求のダイアログ（しおりから開く）: 要求の中身と、断る（アクション participant-decline。断りは残さない）・受け入れる（受け入れのダイアログに替える。
// 引き継ぐか新しく始めるかはそこで選ぶ）。閉じる（Esc・×）だけなら要求は残り、しおりもそのまま。要求中でなくなったら「返事済み」と見せる
import { useMessages, useT } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useAllowedOn, useCoreCatalog } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { PARTICIPANT_ACCEPT, PARTICIPANT_DECLINE } from "."
import { PARTICIPANT_JOIN_DIALOG } from "./dialogs"
import { useParticipants } from "./hooks"
import styles from "./Participant.module.css"
import { requestLines } from "./request"

export function JoinRequestDialog({ args, onClose }: DialogProps<{ participant: string }>) {
  const t = useMessages(kit)
  const tt = useT()
  const catalog = useCoreCatalog()
  const { perform, showToast, openDialog } = useActions()
  const id = args.participant
  const requested = useParticipants().find(p => p.id === id && p.state === "requested")
  const canDecline = useAllowedOn(PARTICIPANT_DECLINE.id, {}, { record: id }).ok
  // 受け入れるダイアログを開く前に、受け入れが行えるかを聞く（部屋は試しの値）
  const canAccept = useAllowedOn(PARTICIPANT_ACCEPT.id, { workroom: "-" }, { record: id }).ok
  const decline = () => {
    const done = perform(PARTICIPANT_DECLINE.id, {}, { record: id })
    if (done.ok) onClose()
    else
      showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Could not answer the request")) })
  }
  const accept = () => {
    onClose()
    openDialog(PARTICIPANT_JOIN_DIALOG.id, { participant: id })
  }
  return (
    <Dialog title={t("A join request arrived from an AI agent")} width={420} onClose={onClose}>
      {requested ? (
        <>
          <p className={styles.request}>{requestLines(requested, tt)}</p>
          <div className={styles.buttons}>
            <ActionButton onClick={decline} disabled={!canDecline} danger>
              {t("Decline")}
            </ActionButton>
            <ActionButton primary onClick={accept} disabled={!canAccept}>
              {t("Accept")}
            </ActionButton>
          </div>
        </>
      ) : (
        <p>{t("Already answered")}</p>
      )}
    </Dialog>
  )
}
