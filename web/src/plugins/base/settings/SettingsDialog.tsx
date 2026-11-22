// 設定画面のダイアログ: 設定画面の中身（SettingsScreen）を包む（開くときに渡した設定カテゴリを選んでおく）。変えた値はその場で書くので、見出しの行には閉じるボタンだけを置く
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { SettingsScreen } from "./SettingsScreen"

export function SettingsDialog({ args, onClose }: DialogProps<{ category?: string }>) {
  const t = useMessages(kit)
  return (
    <Dialog
      title={t("Settings")}
      width={720}
      height={480}
      onClose={onClose}
      actions={<ActionButton onClick={onClose}>{t("Close")}</ActionButton>}
    >
      <SettingsScreen initial={args.category} />
    </Dialog>
  )
}
