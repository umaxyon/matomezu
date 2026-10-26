// メニューのコマンド: 開いているメニュー（右クリックのメニュー・道具のアイコン）を閉じる（キーの既定は Escape と Space）
import { defineKeys } from "../../../store/keys"
import { kit } from "../kit"

export const MENU_CLOSE = kit.defineCommand({
  id: "menu-close",
  title: "Close menu",
  run: (_ctx, a) => {
    a.closeContextMenu()
    a.closePicker()
  },
  when: ctx => ctx.contextMenu !== null || ctx.workspace.stages.some(s => s.picker !== null),
})

// Space で開いた道具のアイコンは、もう一度 Space で閉じる
export const MENU_KEYS = defineKeys([
  { key: "Escape", command: "@matomezu/base:menu-close", scope: "menu" },
  { key: "Space", command: "@matomezu/base:menu-close", scope: "menu" },
])
