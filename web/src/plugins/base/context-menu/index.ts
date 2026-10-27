// メニューのコマンド: 開いているメニュー（右クリックのメニュー・道具のアイコン）を閉じる（キーの既定は Escape と Space）
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
export const MENU_KEYS = [
  kit.defineKey({ id: "menu-close-escape", key: "Escape", command: MENU_CLOSE.id, scope: "menu" }),
  kit.defineKey({ id: "menu-close-space", key: "Space", command: MENU_CLOSE.id, scope: "menu" }),
]
