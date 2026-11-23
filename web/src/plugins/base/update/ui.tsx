// 版の更新のウィジェット: 古い版の画面のダイアログ（根に置く）と、設定カテゴリ「更新」
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineSettingsCategory } from "../settings/categories"
import { StaleBuildDialog } from "./StaleBuildDialog"
import { UPDATE_CHECK } from "./setting"
import { UpdateCategory } from "./UpdateCategory"

export const STALE_BUILD = defineWidget({ id: kit.name("stale-build"), slots: ["root"], view: StaleBuildDialog })

export { NO_UPDATE_STATUS, useUpdateStatus } from "./hooks"

// 設定カテゴリ「更新」
export const UPDATE_CATEGORY = defineSettingsCategory({
  id: kit.name("settings-update"),
  title: kit.message("Updates"),
  settings: [UPDATE_CHECK.id],
  view: UpdateCategory,
})
