// 右クリックのメニューの置き場のウィジェット: 根に置き、開いているメニューを押した位置に描く。アンカーだけのメニューも開く（anchor-context.tsx）
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { ANCHOR_CONTEXT } from "./anchor-context"
import { ContextMenuHost } from "./ContextMenuHost"

export const MENU_HOST = defineWidget({
  id: kit.name("menu-host"),
  slots: ["root"],
  view: ContextMenuHost,
  contextMenus: [ANCHOR_CONTEXT],
})
