// プロジェクトの設定を、窓の今のステージで開く関数を返すフック（ボードの帯の歯車が使う）
import { useActions, useWindowStage } from "../../../plugin-api/ui"
import { PROJECT_SETTINGS_DIALOG } from "."

export function useOpenProjectSettings(): (project: string) => void {
  const stage = useWindowStage()
  const { openDialog } = useActions()
  return project => openDialog(stage, PROJECT_SETTINGS_DIALOG.id, { project })
}
