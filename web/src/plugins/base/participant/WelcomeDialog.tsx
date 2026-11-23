// ようこそのダイアログ: 受け入れた参加者を知らせる（受け入れたら、受け入れのダイアログに替えて出す）。
// 鳥（ワークルームの。管理者は王冠を重ねる）かビジターの印、「〇〇が参加しました」、参加者区分（管理者は「ワーカー（管理者）」）、モデルを出す
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { AdminCrown } from "./AdminCrown"
import { BirdFaceView } from "./BirdFaceView"
import { asBird } from "./birds"
import { useAdminRoom, useParticipantLive, useParticipants, useWorkrooms } from "./hooks"
import { shownModel } from "./live"
import styles from "./Participant.module.css"
import { isAdminParticipant, NO_CATEGORY, type ParticipantCategory, participantCategory, visitorName } from "./rows"
import { VisitorIcon } from "./VisitorIcon"

const CATEGORY_TITLES = {
  worker: "Worker",
  visitor: "Visitor (read only)",
} as const satisfies Record<ParticipantCategory, string>

export function ParticipantWelcomeDialog({ args, onClose }: DialogProps<{ participant: string }>) {
  const t = useMessages(kit)
  const who = useParticipants().find(p => p.id === args.participant)
  const room = useWorkrooms().find(r => r.id === who?.workroom)
  const admin = useAdminRoom()
  const live = useParticipantLive()
  const category = who ? participantCategory(who) : NO_CATEGORY
  const isAdmin = !!who && isAdminParticipant(who, admin)
  const bird = room ? asBird(room.bird) : undefined
  return (
    <Dialog title={t("Welcome")} width={360} onClose={onClose}>
      {who && category !== NO_CATEGORY ? (
        <div className={styles.welcome}>
          {bird ? (
            <AdminCrown admin={isAdmin} size={56}>
              <BirdFaceView bird={bird} {...(room?.palette ? { palette: room.palette } : {})} size={56} />
            </AdminCrown>
          ) : (
            <VisitorIcon size={56} />
          )}
          <p className={styles.name}>{t("{name} joined", { name: room ? room.name : visitorName(who) })}</p>
          <dl className={styles.welcomeFacts}>
            <dt>{t("Participant category")}</dt>
            <dd>{t(isAdmin ? "Worker (administrator)" : CATEGORY_TITLES[category])}</dd>
            <dt>{t("Model")}</dt>
            <dd>{shownModel(who, live[who.id])}</dd>
          </dl>
        </div>
      ) : (
        <p>{t("The participant is not here any more")}</p>
      )}
      <div className={styles.buttons}>
        <ActionButton primary onClick={onClose}>
          {t("Close")}
        </ActionButton>
      </div>
    </Dialog>
  )
}
