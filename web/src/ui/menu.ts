// メニュー: UI マッピングのメニューの項目を、描いている場所（ui/scope.tsx）から見て出すコマンドにする。切り替え（either）は出ている最初の 1 つ

import type { MenuId } from "../core/catalog"
import { isShown } from "../store/commands"
import { type MenuCommandId, type MenuItem, menuCommands } from "./layout"
import { useAt } from "./scope"
import { useInstance, useLayout, useMatomezuState } from "./store-context"

export function useMenu(menu: MenuId): readonly MenuItem[] {
  return useLayout().menus[menu] ?? []
}

// useMenuCommand の、出すコマンドが無いときの値
export const NO_MENU_COMMAND = "none"

// 項目のうち、今出すコマンド（どれも出ていなければ NO_MENU_COMMAND。向け先が無い所でも NO_MENU_COMMAND）
export function useMenuCommand(item: MenuItem): MenuCommandId | typeof NO_MENU_COMMAND {
  const at = useAt()
  const defs = useInstance()
  const ids = menuCommands(item)
  const found = useMatomezuState(s => (at === null ? -1 : ids.findIndex(id => isShown(defs, s, at, id))))
  return ids[found] ?? NO_MENU_COMMAND
}
