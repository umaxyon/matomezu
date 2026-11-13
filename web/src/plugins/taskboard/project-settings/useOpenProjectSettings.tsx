// プロジェクトの設定を、描いている場所のスクリーンから開く関数を返すフック（ボードの帯の歯車が使う）
import { useActions, useScreenId } from "../../../plugin-api/ui"
import { PROJECT_SETTINGS_DIALOG } from "."

export function useOpenProjectSettings(): (project: string) => void {
  const here = useScreenId()
  const { openDialog } = useActions()
  return project => openDialog(here, PROJECT_SETTINGS_DIALOG.id, { project })
}
