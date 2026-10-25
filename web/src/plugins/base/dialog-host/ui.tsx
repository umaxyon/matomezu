// ダイアログの置き場のウィジェット: 根に置き、開いているダイアログを描く
import { defineWidget } from "../../../ui/layout"
import { DialogHost } from "./DialogHost"

export const DIALOG_HOST = defineWidget({ id: "dialog-host", slots: ["root"], view: DialogHost })
