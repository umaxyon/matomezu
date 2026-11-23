// 退室の確認: 退室するワークルーム（鳥と名前）と、キャンセル・部屋を出る（空室になる）・部屋を削除する（行が消える）。
// 空室なら削除の確認になり、キャンセル・部屋を削除するだけを出す。ワークルームが無くなっていれば、すぐ閉じる
import { useEffect } from "react"
import type { DialogProps } from "../../plugin-api/ui"
import { useMessages } from "../../plugin-api/ui"
import { ActionButton, Dialog, useOwnBookPages, useWorkroomActions, useWorkroomRows } from "../base/ui"
import { Bird } from "./Bird"
import { kit } from "./kit"
import styles from "./WorkroomLeaveDialog.module.css"

export function WorkroomLeaveDialog({ args, onClose }: DialogProps<{ workroom: string }>) {
  const t = useMessages(kit)
  const row = useWorkroomRows().find(r => r.room.id === args.workroom)
  const rooms = useWorkroomActions()
  const occupant = row?.participant?.id
  // ワークルームを消すと、ワークルーム自身のワーカーブックが完全に消える
  const pages = useOwnBookPages(args.workroom)
  const gone = !row
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (gone) return null
  const done = (ok: boolean) => {
    if (ok) onClose()
  }
  return (
    <Dialog title={occupant === undefined ? t("Delete the room") : t("Leave")} width={440} onClose={onClose}>
      <p className={styles.text}>
        <span className={styles.room}>
          <Bird row={row} />
          {row.room.name}
        </span>
        {occupant === undefined ? t("Deleting the workroom") : t("Leaving the workroom")}
      </p>
      {occupant === undefined ? (
        <div className={styles.warn}>
          <p>{t("Cannot be undone")}</p>
          <p>{t("No AI can continue")}</p>
        </div>
      ) : null}
      {pages > 0 ? <p className={styles.text}>{t("Pages to be removed: {n}", { n: pages })}</p> : null}
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        {occupant === undefined ? null : (
          <ActionButton onClick={() => done(rooms.leave(occupant))}>{t("Leave the room")}</ActionButton>
        )}
        <ActionButton danger onClick={() => done(rooms.remove(row.room.id, occupant))}>
          {t("Delete the room")}
        </ActionButton>
      </div>
    </Dialog>
  )
}
