// ペアリングしたホストの詳しい所（スロット picked-detail に置き、種類 paired-host を名乗る）: ホスト名（利用者名）、つながっているか・最後につながった時刻、
// 待っている所、鍵の印（覚えた鍵と合わない相手が答えたときは、その横に一言）。［ペアリングを解く］は題の行の右（枠の高さが決まっているため。相手にも知らせる。相手が切れていれば、次につないできたときに断る）
import { useActions, useAllowedOn, useMessages, useRecord, useRecords } from "../../plugin-api/ui"
import { ActionButton, Elapsed, useHostPeers } from "../base/ui"
import { hostRows, shownName } from "./hosts"
import { kit } from "./kit"
import { shownHostKey } from "./NetworkCategory"
import styles from "./OtherHosts.module.css"
import { PAIRED_HOST, PAIRED_HOST_REMOVE } from "./pairing"

export function PairedHostDetail({ id }: { id: string }) {
  const t = useMessages(kit)
  const { perform } = useActions()
  const record = useRecord(PAIRED_HOST.id, id)
  const all = hostRows(useRecords(PAIRED_HOST.id, { where: [] }), useHostPeers()?.paired ?? [])
  const canRemove = useAllowedOn(PAIRED_HOST_REMOVE.id, {}, { record: id }).ok
  const row = all.find(r => r.record.id === id)
  if (!record || !row) return null
  const addr = row.live?.addr || record.addr
  return (
    <div className={styles.detail}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          {shownName(row, all)}
          {row.userName ? <span className={styles.user}>（{row.userName}）</span> : null}
        </h2>
        <ActionButton danger disabled={!canRemove} onClick={() => perform(PAIRED_HOST_REMOVE.id, {}, { record: id })}>
          {t("Unpair")}
        </ActionButton>
      </div>
      <dl className={styles.facts}>
        <dt>{t("Connection")}</dt>
        <dd>
          <span className={styles.dot} data-connected={row.live?.connected === true} />
          {row.live?.connected ? t("Connected") : t("Not connected")}
          {row.live?.lastSeen ? (
            <span className={styles.seen}>
              {t("Last connected")} <Elapsed at={row.live.lastSeen} />
            </span>
          ) : null}
        </dd>
        <dt>{t("Listening at")}</dt>
        <dd>{addr ? <code>{addr}</code> : t("Not known yet")}</dd>
        <dt>{t("Key")}</dt>
        <dd>
          <code>{shownHostKey(record.hostId)}</code>
          {row.live?.keyMismatch ? <span className={styles.warn}>{t("The key does not match")}</span> : null}
        </dd>
      </dl>
    </div>
  )
}
