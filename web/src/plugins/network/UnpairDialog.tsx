// ペアリングを解く確認: 解くホスト（名前と利用者名）と、キャンセル・解く。解くと相手にも知らせる。ホストが居なくなっていれば、すぐ閉じる
import { useEffect } from "react"
import { type DialogProps, useActions, useMessages, useRecords } from "../../plugin-api/ui"
import { ActionButton, Dialog, useHostPeers } from "../base/ui"
import { hostRows, shownName } from "./hosts"
import { kit } from "./kit"
import styles from "./Pairing.module.css"
import { PAIRED_HOST, PAIRED_HOST_REMOVE } from "./pairing"

export function UnpairDialog({ args, onClose }: DialogProps<{ pairedHost: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  const all = hostRows(useRecords(PAIRED_HOST.id, { where: [] }), useHostPeers()?.paired ?? [])
  const row = all.find(r => r.record.id === args.pairedHost)
  const gone = !row
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (!row) return null
  return (
    <Dialog title={t("Unpair")} width={440} onClose={onClose}>
      <p className={styles.request}>
        <span className={styles.name}>{shownName(row, all)}</span>
        {row.userName ? <span className={styles.muted}>{t("({name})", { name: row.userName })}</span> : null}
      </p>
      <p>{t("Unpairing tells the other host too")}</p>
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        <ActionButton
          danger
          onClick={() => perform(PAIRED_HOST_REMOVE.id, {}, { record: args.pairedHost }).ok && onClose()}
        >
          {t("Unpair button")}
        </ActionButton>
      </div>
    </Dialog>
  )
}
