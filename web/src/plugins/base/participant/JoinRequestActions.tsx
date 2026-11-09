// 参加要求の郵便のダイアログの下の行: 断る（アクション participant-decline。断りは残さない）と、受け入れる（受け入れのダイアログを開く。引き継ぐか新しく始めるかはそこで選ぶ）。
// 参加者がまだ保留中のときだけ出す（受け入れ済み・断り済みなら、何も出さない）
import { useMessages } from "../../../ui/i18n"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useAllowedOn, useCoreCatalog } from "../../../ui/view-hooks"
import { BIRD_IDS } from "../birds"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { MailActionsProps } from "../mail/slots"
import { refusalMessage } from "../utils/refusal"
import { PARTICIPANT_ACCEPT, PARTICIPANT_DECLINE } from "."
import { PARTICIPANT_JOIN_DIALOG } from "./dialogs"

export function JoinRequestActions({ stage, mail, onClose }: MailActionsProps) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const { perform, showToast, openDialog } = useActions()
  const id = (mail.props as { participant?: string }).participant ?? ""
  const requested = useMatomezuState(s => s.participants.some(p => p.id === id && p.state === "requested"))
  const canDecline = useAllowedOn(PARTICIPANT_DECLINE.id, { participant: id }).ok
  // 受け入れるダイアログを開く前に、受け入れが行えるかを聞く（名前と鳥は試しの値）
  const canAccept = useAllowedOn(PARTICIPANT_ACCEPT.id, { participant: id, workroom: "-", bird: BIRD_IDS[0] }).ok
  if (!requested) return null
  const decline = () => {
    const done = perform(PARTICIPANT_DECLINE.id, { participant: id })
    if (done.ok) onClose()
    else
      showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Could not answer the request")) })
  }
  return (
    <>
      <ActionButton onClick={decline} disabled={!canDecline} danger>
        {t("Decline")}
      </ActionButton>
      <ActionButton
        primary
        onClick={() => openDialog(stage, PARTICIPANT_JOIN_DIALOG.id, { participant: id })}
        disabled={!canAccept}
      >
        {t("Accept")}
      </ActionButton>
    </>
  )
}
