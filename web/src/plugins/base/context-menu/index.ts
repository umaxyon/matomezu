// 右クリックのメニューのコマンド: 開いているメニューを閉じる（キーの既定は Escape）
import { defineCommand } from "../../../store/commands/def"
import { defineKeys } from "../../../store/keys"

export const MENU_CLOSE = defineCommand({
  id: "menu.close",
  title: "Close menu",
  run: (_ctx, a) => a.closeContextMenu(),
  when: ctx => ctx.contextMenu !== null,
})

export const MENU_KEYS = defineKeys([{ key: "Escape", command: "menu.close", scope: "menu" }])
