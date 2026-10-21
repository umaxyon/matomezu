// 図面の設定のダイアログ: 見出しと閉じるボタン
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { Dialog } from "../../../base/ui"
import styles from "./SettingsDialog.module.css"

export function SettingsDialog({ onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("Settings")} onClose={onClose}>
      <div className={styles.actions}>
        <button type="button" className={styles.close} onClick={onClose}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  )
}
