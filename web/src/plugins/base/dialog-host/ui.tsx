// ダイアログの置き場のウィジェット: 根に置き、開いているダイアログを描く
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { DialogHost } from "./DialogHost"

export const DIALOG_HOST = defineWidget({ id: kit.name("dialog-host"), slots: ["root"], view: DialogHost })
