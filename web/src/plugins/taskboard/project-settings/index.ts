// プロジェクト設定のダイアログの定義（渡す値は、直すプロジェクトの id）
import { kit } from "../kit"

export const PROJECT_SETTINGS_DIALOG = kit.defineDialogWith<{ project: string }>()({ id: "project-settings" })
