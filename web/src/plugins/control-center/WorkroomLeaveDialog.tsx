// 退室の確認: 退室するワークルーム（鳥と名前）と、キャンセル・部屋を出る（空室になる）・部屋を削除する（行が消える）。
// ワークルームが無くなっていたり空室だったりすれば、すぐ閉じる
import { useEffect } from "react"
import type { DialogProps } from "../../plugin-api/ui"
import { useMessages } from "../../plugin-api/ui"
import { ActionButton, Dialog, useWorkroomActions, useWorkroomRows } from "../base/ui"
import { Bird } from "./Bird"
import { kit } from "./kit"
import styles from "./WorkroomLeaveDialog.module.css"

export function WorkroomLeaveDialog({ args, onClose }: DialogProps<{ workroom: string }>) {
  const t = useMessages(kit)
  const row = useWorkroomRows().find(r => r.room.id === args.workroom)
  const rooms = useWorkroomActions()
  const occupant = row?.participant?.id
  const gone = !row || occupant === undefined
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (gone) return null
  const done = (ok: boolean) => {
    if (ok) onClose()
  }
  return (
    <Dialog title={t("Leave")} width={440} onClose={onClose}>
      <p className={styles.text}>
        <span className={styles.room}>
          <Bird row={row} />
          {row.room.name}
        </span>
        {t("Leaving the workroom")}
      </p>
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        <ActionButton onClick={() => done(rooms.leave(occupant))}>{t("Leave the room")}</ActionButton>
        <ActionButton danger onClick={() => done(rooms.remove(row.room.id, occupant))}>
          {t("Delete the room")}
        </ActionButton>
      </div>
    </Dialog>
  )
}
