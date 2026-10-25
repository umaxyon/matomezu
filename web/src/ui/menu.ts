// メニュー: 配置のメニューの項目を、そのステージから見て出すコマンドにする。切り替え（either）は出ている最初の 1 つ

import type { MenuId } from "../core/catalog"
import { isShown } from "../store/commands"
import { type MenuCommandId, type MenuItem, menuCommands } from "./layout"
import { useApp, useInstance, useLayout } from "./store-context"

export function useMenu(menu: MenuId): readonly MenuItem[] {
  return useLayout().menus[menu] ?? []
}

// 項目のうち、今出すコマンド（どれも出ていなければ null）
export function useMenuCommand(stage: string, item: MenuItem): MenuCommandId | null {
  const defs = useInstance()
  const ids = menuCommands(item)
  const at = useApp(s => ids.findIndex(id => isShown(defs, s, stage, id)))
  return ids[at] ?? null
}
