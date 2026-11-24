// ほかのホストからの頼みを、利用者の頼みとして受けるようにする確かめ: ホスト（名前と利用者名）と、何が変わるかの一言、キャンセル・頼みとして受ける。
// ホストが居なくなっていれば、すぐ閉じる
import { useEffect } from "react"
import { type DialogProps, useActions, useMessages, useRecords } from "../../plugin-api/ui"
import { ActionButton, Dialog, NOT_TOLD, useHostPeers } from "../base/ui"
import { hostRows } from "./hosts"
import { kit } from "./kit"
import { pairedOf } from "./OtherHosts"
import styles from "./Pairing.module.css"
import { PAIRED_HOST, PAIRED_HOST_REQUESTS_SET } from "./pairing"

export function AsUserDialog({ args, onClose }: DialogProps<{ pairedHost: string }>) {
  const t = useMessages(kit)
  const { perform } = useActions()
  const all = hostRows(useRecords(PAIRED_HOST.id, { where: [] }), pairedOf(useHostPeers()), NOT_TOLD)
  const row = all.find(r => r.record.id === args.pairedHost)
  const gone = !row
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (!row) return null
  return (
    <Dialog title={t("Take requests from this host")} width={440} onClose={onClose}>
      <p className={styles.request}>
        <span className={styles.name}>{row.label}</span>
        {row.userName ? <span className={styles.muted}>{t("({name})", { name: row.userName })}</span> : null}
      </p>
      <p>{t("Your AIs do what the AIs of {name} ask, without asking you", { name: row.label })}</p>
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        <ActionButton
          danger
          onClick={() =>
            perform(PAIRED_HOST_REQUESTS_SET.id, { requests: "as-user" }, { record: args.pairedHost }).ok && onClose()
          }
        >
          {t("Take as requests")}
        </ActionButton>
      </div>
    </Dialog>
  )
}
