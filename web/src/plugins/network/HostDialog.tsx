// ペアリングしたホスト 1 つの行を引くフック usePairedHostRow と、そのホストについてのダイアログの枠 HostDialog: 頭にホスト（ホストエイリアスと利用者名）。
// ホストが居なくなっていれば、すぐ閉じる
import { type ReactNode, useEffect } from "react"
import { useMessages, useRecords } from "../../plugin-api/ui"
import { Dialog, NOT_TOLD, type PeerLive, useHostPeers } from "../base/ui"
import { type HostRow, hostRows } from "./hosts"
import { kit } from "./kit"
import { pairedOf } from "./OtherHosts"
import styles from "./Pairing.module.css"
import { PAIRED_HOST } from "./pairing"

// ペアリングしたホスト（レコードの id）の行。居なければ undefined
export function usePairedHostRow(id: string): HostRow<PeerLive> | undefined {
  const all = hostRows(useRecords(PAIRED_HOST.id, { where: [] }), pairedOf(useHostPeers()), NOT_TOLD)
  return all.find(r => r.record.id === id)
}

export function HostDialog({
  pairedHost,
  title,
  width,
  onClose,
  children,
}: {
  pairedHost: string
  title: string
  width: number
  onClose: () => void
  children: (row: HostRow<PeerLive>) => ReactNode
}) {
  const t = useMessages(kit)
  const row = usePairedHostRow(pairedHost)
  const gone = !row
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])
  if (!row) return null
  return (
    <Dialog title={title} width={width} onClose={onClose}>
      <p className={styles.request}>
        <span className={styles.name}>{row.label}</span>
        {row.userName ? <span className={styles.muted}>{t("({name})", { name: row.userName })}</span> : null}
      </p>
      {children(row)}
    </Dialog>
  )
}
