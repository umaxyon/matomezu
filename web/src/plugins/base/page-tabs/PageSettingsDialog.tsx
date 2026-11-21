// ページの設定のダイアログ: 開いているページの名前・紙・ページの設定の項目・ロック・削除（PageSettingsDialogView だけ。ページの設定のダイアログを名指さないタイプのページが使う）
import type { DialogProps } from "../../../ui/plugin"
import { PageSettingsDialogView } from "./PageSettingsDialogView"

export function PageSettingsDialog({ args, onClose }: DialogProps<{ page: string }>) {
  return <PageSettingsDialogView page={args.page} onClose={onClose} />
}
