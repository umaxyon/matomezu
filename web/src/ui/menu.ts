// メニュー: UI マッピングのメニューの項目を、描いている場所（ui/scope.tsx）から見て出すコマンドにする。切り替え（either）は出ている最初の 1 つ

import type { MenuId } from "../core/catalog"
import type { LegacyId } from "../core/legacy"
import { isShown } from "../store/commands"
import { type MenuCommandId, type MenuItem, menuCommands } from "./layout"
import { checkLegacy, useAt, useScope } from "./scope"
import { useInstance, useLayout, useMatomezuState } from "./store-context"

export function useMenu(menu: MenuId): readonly MenuItem[] {
  return useLayout().menus[menu] ?? []
}

// 項目のうち、今出すコマンド（どれも出ていなければ null。向け先が無い所では null）
export function useMenuCommand(item: MenuItem): MenuCommandId | null
// 橋渡しの間だけ: 古い形（第 1 引数にステージの id）
export function useMenuCommand(legacy: LegacyId, item: MenuItem): MenuCommandId | null
export function useMenuCommand(...given: readonly unknown[]): MenuCommandId | null {
  const old = given.length === 2
  const item = (old ? given[1] : given[0]) as MenuItem
  checkLegacy(useScope(), old ? (given[0] as string) : undefined, "useMenuCommand")
  const at = useAt()
  const defs = useInstance()
  const ids = menuCommands(item)
  const found = useMatomezuState(s => (at === null ? -1 : ids.findIndex(id => isShown(defs, s, at, id))))
  return ids[found] ?? null
}
