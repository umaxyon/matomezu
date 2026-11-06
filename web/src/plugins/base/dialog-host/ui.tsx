// ダイアログの置き場のウィジェット: 根に置き、開いているダイアログを描く。描くダイアログの中のスロット（設定画面の項目）も開ける
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { SETTINGS_SECTIONS } from "../settings/settings-screen"
import { DialogHost } from "./DialogHost"

export const DIALOG_HOST = defineWidget({
  id: kit.name("dialog-host"),
  slots: ["root"],
  opens: [SETTINGS_SECTIONS],
  view: DialogHost,
})
