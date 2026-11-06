// ダイアログの置き場のウィジェット: 根に置き、開いているダイアログを描く。描くダイアログの中のスロット（設定カテゴリ）も開ける
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { SETTINGS_CATEGORIES } from "../settings/settings-screen"
import { DialogHost } from "./DialogHost"

export const DIALOG_HOST = defineWidget({
  id: kit.name("dialog-host"),
  slots: ["root"],
  opens: [SETTINGS_CATEGORIES],
  view: DialogHost,
})
