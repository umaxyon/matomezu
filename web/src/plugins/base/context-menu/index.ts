// メニューのコマンド: 開いているメニュー（右クリックのメニュー・道具のアイコン）を閉じる（キーの既定は Escape と Space）。
// メニューはステージを持たないスクリーンでも開くので、スクリーンから呼ぶコマンド（キーの範囲 menu が効くのは、メニューか道具のアイコンが開いている間だけ）
import { kit } from "../kit"

export const MENU_CLOSE = kit.defineScreenCommand({
  id: "menu-close",
  title: "Close menu",
  run: (_ctx, a) => {
    a.closeContextMenu()
    a.closePicker()
  },
  when: () => true,
})

// Space で開いた道具のアイコンは、もう一度 Space で閉じる
export const MENU_KEYS = [
  kit.defineKey({ id: "menu-close-escape", key: "Escape", command: MENU_CLOSE.id, scope: "menu" }),
  kit.defineKey({ id: "menu-close-space", key: "Space", command: MENU_CLOSE.id, scope: "menu" }),
]

export { CONTEXT_MENU_STATES, PRESSED_ANCHOR } from "./states"
