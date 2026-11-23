// ペアリングしたホストの詳しい所（スロット picked-detail に置き、種類 paired-host を名乗る）: ホスト名（利用者名）、つながっているか・最後につながった時刻、
// 待っている所、鍵の印（覚えた鍵と合わない相手が答えたときは、その横に一言）。右下にペアリングを解くアイコン（ワークルームの退室・ビジターの外すと同じ置き方。押すと確かめのダイアログ）
import { NO_RECORD } from "../../plugin-api"
import { useActions, useAllowedOn, useMessages, useRecord, useRecords } from "../../plugin-api/ui"
import { Elapsed, IconButton, NOT_TOLD, Tip, useHostPeers } from "../base/ui"
import { UNPAIR_DIALOG } from "./dialogs"
import { hostRows, shownName } from "./hosts"
import { UnpairIcon } from "./icons"
import { kit } from "./kit"
import { shownHostKey } from "./NetworkCategory"
import { pairedOf } from "./OtherHosts"
import styles from "./OtherHosts.module.css"
import { PAIRED_HOST, PAIRED_HOST_REMOVE } from "./pairing"

export function PairedHostDetail({ id }: { id: string }) {
  const t = useMessages(kit)
  const { openDialog } = useActions()
  const record = useRecord(PAIRED_HOST.id, id)
  const all = hostRows(useRecords(PAIRED_HOST.id, { where: [] }), pairedOf(useHostPeers()), NOT_TOLD)
  const canRemove = useAllowedOn(PAIRED_HOST_REMOVE.id, {}, { record: id }).ok
  const row = all.find(r => r.record.id === id)
  if (record === NO_RECORD || !row) return null
  const told = row.live?.addr
  const addr = told !== undefined && told !== NOT_TOLD ? told : record.addr
  return (
    <div className={styles.detail}>
      <h2 className={styles.title}>
        {shownName(row, all)}
        {row.userName ? <span className={styles.user}>{t("({name})", { name: row.userName })}</span> : null}
      </h2>
      <dl className={styles.facts}>
        <dt>{t("Connection")}</dt>
        <dd>
          <span className={styles.dot} data-connected={row.live?.connected === true} />
          {row.live?.connected ? t("Connected") : t("Not connected")}
          {row.live && row.live.lastSeen !== NOT_TOLD ? (
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
      <span className={styles.unpair}>
        <Tip text={t("Unpair")} side="above">
          <IconButton
            className={styles.unpairButton}
            label={t("Unpair")}
            title={undefined}
            disabled={!canRemove}
            onClick={() => openDialog(UNPAIR_DIALOG.id, { pairedHost: id })}
          >
            <UnpairIcon />
          </IconButton>
        </Tip>
      </span>
    </div>
  )
}
