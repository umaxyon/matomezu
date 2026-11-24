// ペアリングしたホスト 1 つについての確かめのダイアログの形: ホスト（ホストエイリアスと利用者名）、一言、キャンセル・決めるボタン（danger）。
// ホストが居なくなっていれば、すぐ閉じる。決めるボタンの onConfirm が true を返したら閉じる
import { useMessages } from "../../plugin-api/ui"
import { ActionButton } from "../base/ui"
import { HostDialog } from "./HostDialog"
import { kit } from "./kit"
import styles from "./Pairing.module.css"

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
  return (
    <HostDialog pairedHost={pairedHost} title={title} width={440} onClose={onClose}>
      {row => (
        <>
          <p>{text(row.label)}</p>
          <div className={styles.buttons}>
            <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
            <ActionButton danger onClick={() => onConfirm() && onClose()}>
              {confirm}
            </ActionButton>
          </div>
        </>
      )}
    </HostDialog>
  )
}
