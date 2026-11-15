// 設定画面のダイアログ: 設定画面の中身（SettingsScreen）を包む。変えた値はその場で書くので、見出しの行には閉じるボタンだけを置く
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { SettingsScreen } from "./SettingsScreen"

export function SettingsDialog({ onClose }: DialogProps) {
  const t = useMessages(kit)
  return (
    <Dialog
      title={t("Settings")}
      width={720}
      height={480}
      onClose={onClose}
      actions={<ActionButton onClick={onClose}>{t("Close")}</ActionButton>}
    >
      <SettingsScreen />
    </Dialog>
  )
}
