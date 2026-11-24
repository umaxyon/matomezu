// ペアリングしたホストの様子のダイアログ（詳しい所の歯車から開く）: つながっているか・最後につながった時刻、待っている所、鍵の印（覚えた鍵と合わない相手が答えたときは、その横に一言）。
// ホストが居なくなっていれば、すぐ閉じる
import { type DialogProps, useMessages } from "../../plugin-api/ui"
import { ActionButton, Elapsed, NOT_TOLD } from "../base/ui"
import { HostDialog } from "./HostDialog"
import { kit } from "./kit"
import { shownHostKey } from "./NetworkCategory"
import styles from "./OtherHosts.module.css"
import pairingStyles from "./Pairing.module.css"

export function PairedHostInfoDialog({ args, onClose }: DialogProps<{ pairedHost: string }>) {
  const t = useMessages(kit)
  return (
    <HostDialog pairedHost={args.pairedHost} title={t("About this host")} width={480} onClose={onClose}>
      {row => {
        const told = row.live?.addr
        const addr = told !== undefined && told !== NOT_TOLD ? told : row.record.addr
        return (
          <>
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
                <code>{shownHostKey(row.record.hostId)}</code>
                {row.live?.keyMismatch ? <span className={styles.warn}>{t("The key does not match")}</span> : null}
              </dd>
            </dl>
            <div className={pairingStyles.buttons}>
              <ActionButton onClick={onClose}>{t("Close")}</ActionButton>
            </div>
          </>
        )
      }}
    </HostDialog>
  )
}
