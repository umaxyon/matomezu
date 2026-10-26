// 右クリックのメニューの置き場のウィジェット: 根に置き、開いているメニューを押した位置に描く
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { ContextMenuHost } from "./ContextMenuHost"

export const MENU_HOST = defineWidget({ id: kit.name("menu-host"), slots: ["root"], view: ContextMenuHost })
