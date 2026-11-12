// タスクボードのプラグインの見た目: プロジェクト設定のダイアログ（見た目の差し替えを持たない）
import { definePluginUi, useActions, useWindowStage } from "../../plugin-api/ui"
import { TASKBOARD_PLUGIN } from "."
import { ProjectSettingsDialog } from "./ProjectSettingsDialog"
import { PROJECT_SETTINGS_DIALOG } from "./settings-dialog"

export const TASKBOARD_UI = definePluginUi(TASKBOARD_PLUGIN, {
  dialogViews: { [PROJECT_SETTINGS_DIALOG.id]: ProjectSettingsDialog },
})

// プロジェクト project の設定を、窓の今のステージで開く関数を返す（ボードの帯の歯車が使う）
export function useOpenProjectSettings(): (project: string) => void {
  const stage = useWindowStage()
  const { openDialog } = useActions()
  return project => openDialog(stage, PROJECT_SETTINGS_DIALOG.id, { project })
}
