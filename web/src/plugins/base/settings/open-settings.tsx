// 設定画面を、設定カテゴリ category を選んだ形で開く関数を返すフック（コントロールセンターの巣箱が「更新」を開くなど）
import { useCallback } from "react"
import type { WidgetsFor } from "../../../ui/layout"
import { useActions } from "../../../ui/view-hooks"
import { type SETTINGS_CATEGORIES, SETTINGS_DIALOG } from "./settings-screen"

// 設定カテゴリのウィジェットの id（スロット settings-categories に置けるウィジェット）
export type SettingsCategoryId = WidgetsFor<typeof SETTINGS_CATEGORIES>

export function useOpenSettings(category: SettingsCategoryId): () => void {
  const { openDialog } = useActions()
  return useCallback(() => openDialog(SETTINGS_DIALOG.id, { category }), [openDialog, category])
}
