// ペアリングしたホスト 1 つについての確かめのダイアログの形: ホスト（呼び名と利用者名）、一言、キャンセル・決めるボタン（danger）。
// ホストが居なくなっていれば、すぐ閉じる。決めるボタンの onConfirm が true を返したら閉じる
import { useEffect } from "react"
import { useMessages, useRecords } from "../../plugin-api/ui"
import { ActionButton, Dialog, NOT_TOLD, useHostPeers } from "../base/ui"
import { hostRows } from "./hosts"
import { kit } from "./kit"
import { pairedOf } from "./OtherHosts"
import styles from "./Pairing.module.css"
import { PAIRED_HOST } from "./pairing"

export function HostConfirm({
  pairedHost,
  title,
  text,
  confirm,
  onConfirm,
  onClose,
}: {
  pairedHost: string
  title: string
  text: (label: string) => string
  confirm: string
  onConfirm: () => boolean
  onClose: () => void
}) {
  const t = useMessages(kit)
  const all = hostRows(useRecords(PAIRED_HOST.id, { where: [] }), pairedOf(useHostPeers()), NOT_TOLD)
  const row = all.find(r => r.record.id === pairedHost)
  const gone = !row
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (!row) return null
  return (
    <Dialog title={title} width={440} onClose={onClose}>
      <p className={styles.request}>
        <span className={styles.name}>{row.label}</span>
        {row.userName ? <span className={styles.muted}>{t("({name})", { name: row.userName })}</span> : null}
      </p>
      <p>{text(row.label)}</p>
      <div className={styles.buttons}>
        <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
        <ActionButton danger onClick={() => onConfirm() && onClose()}>
          {confirm}
        </ActionButton>
      </div>
    </Dialog>
  )
}
