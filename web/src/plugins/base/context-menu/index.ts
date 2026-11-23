// 右クリックのメニューのコマンド: 開いている右クリックのメニューを閉じる（キーの既定は Escape と Space）。
// 右クリックのメニューはステージを持たないスクリーンでも開くので、スクリーンから呼ぶコマンド（キーの範囲 menu が効くのは、右クリックのメニューが開いている間だけ）
import { NO_CONTEXT_MENU } from "../../../store/context-menus"
import { kit } from "../kit"

export const MENU_CLOSE = kit.defineScreenCommand({
  id: "menu-close",
  title: "Close menu",
  run: (_ctx, a) => a.closeContextMenu(),
  when: ctx => ctx.contextMenu !== NO_CONTEXT_MENU,
})

export const MENU_KEYS = [
  kit.defineKey({ id: "menu-close-escape", key: "Escape", command: MENU_CLOSE.id, scope: "menu" }),
  kit.defineKey({ id: "menu-close-space", key: "Space", command: MENU_CLOSE.id, scope: "menu" }),
]

export { CONTEXT_MENU_STATES, PRESSED_ANCHOR } from "./states"
