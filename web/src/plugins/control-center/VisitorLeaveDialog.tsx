// ビジターを外す確認: 外すビジター（印と呼び名）と、キャンセル・外す。ビジターが居なくなっていれば、すぐ閉じる
import { useEffect } from "react"
import type { DialogProps } from "../../plugin-api/ui"
import { useMessages } from "../../plugin-api/ui"
import { visitorName } from "../base"
import { ActionButton, Dialog, useVisitorRows, useWorkroomActions, VisitorIcon } from "../base/ui"
import { BIRD_SIZE } from "./Bird"
import { kit } from "./kit"
import styles from "./WorkroomLeaveDialog.module.css"

export function VisitorLeaveDialog({ args, onClose }: DialogProps<{ participant: string }>) {
  const t = useMessages(kit)
  const row = useVisitorRows().find(r => r.participant.id === args.participant)
  const rooms = useWorkroomActions()
  const gone = !row
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (gone) return null
  return (
    <Dialog title={t("Remove the visitor")} width={440} onClose={onClose}>
      <p className={styles.text}>
        <span className={styles.room}>
          <VisitorIcon size={BIRD_SIZE} />
          {visitorName(row.participant)}
        </span>
        {t("Removing the visitor")}
      </p>
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        <ActionButton danger onClick={() => rooms.leave(row.participant.id) && onClose()}>
          {t("Remove")}
        </ActionButton>
      </div>
    </Dialog>
  )
}
