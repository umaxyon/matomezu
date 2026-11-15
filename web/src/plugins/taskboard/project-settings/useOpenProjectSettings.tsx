// プロジェクトの設定を、描いている場所のスクリーンから開く関数を返すフック（ボードの帯の歯車が使う）
import { useActionsHere } from "../../../plugin-api/ui"
import { PROJECT_SETTINGS_DIALOG } from "."

export function useOpenProjectSettings(): (project: string) => void {
  const { openDialog } = useActionsHere()
  return project => openDialog(PROJECT_SETTINGS_DIALOG.id, { project })
}
