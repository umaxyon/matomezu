// 別のポートにするかの確かめ: 変えると効かなくなる物（足したファイアウォールの規則・相手が手で入れた待っている所）と、キャンセル・別のポートにする。
// 設定のダイアログから開くので（ダイアログは 1 つだけ）、どちらで閉じても設定の「ネットワーク」に戻る。入口がもう使われていない様子なら、すぐ戻る
import { useEffect, useState } from "react"
import { type DialogProps, useMessages } from "../../plugin-api/ui"
import { ActionButton, Dialog, useAskHosts, useHostStatus, useOpenSettings } from "../base/ui"
import { kit } from "./kit"
import styles from "./NetworkCategory.module.css"

export function PortRepickDialog(_: DialogProps) {
  const t = useMessages(kit)
  const status = useHostStatus()
  const ask = useAskHosts()
  const back = useOpenSettings(kit.name("settings"))
  const [failed, setFailed] = useState(false)
  const taken = status?.failed === "port-in-use"
  useEffect(() => {
    if (!taken) back()
  }, [taken, back])
  if (!taken) return null
  const repick = () =>
    void ask({ kind: "repick-port" }).then(
      () => back(),
      () => setFailed(true),
    )
  return (
    <Dialog title={t("Use another port")} width={460} onClose={back}>
      <p className={styles.confirm}>{t("Port {port} is used by another program", { port: status.port ?? "" })}</p>
      <p className={styles.confirmNote}>
        {t("With another port, firewall rules for port {port} and addresses typed in on other hosts stop working", {
          port: status.port ?? "",
        })}
      </p>
      {failed && <p className={styles.confirmNote}>{t("Could not open the entrance for other hosts")}</p>}
      <div className={styles.buttons}>
        <ActionButton onClick={back}>{t("Cancel")}</ActionButton>
        <ActionButton onClick={repick}>{t("Use another port")}</ActionButton>
      </div>
    </Dialog>
  )
}
