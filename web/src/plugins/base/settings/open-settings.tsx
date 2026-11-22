// 設定画面を、設定カテゴリ category を選んだ形で開く関数を返すフック（コントロールセンターの巣箱が「更新」を開くなど）
import { useCallback } from "react"
import { useActions } from "../../../ui/view-hooks"
import { SETTINGS_DIALOG } from "./settings-screen"

export function useOpenSettings(category: string): () => void {
  const { openDialog } = useActions()
  return useCallback(() => openDialog(SETTINGS_DIALOG.id, { category }), [openDialog, category])
}
