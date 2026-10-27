// ページの見た目: ページのタブのウィジェットと、ページを作るダイアログ・ページの設定のダイアログ
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS } from "../workspace/ui"
import { NEW_PAGE_DIALOG, PAGE_SETTINGS_DIALOG } from "."
import { NewPageDialog } from "./NewPageDialog"
import { PageSettingsDialog } from "./PageSettingsDialog"
import { PageTabs } from "./PageTabs"

export const PAGE_TABS = defineWidget({ id: kit.name("page-tabs"), slots: STAGE_SLOTS, view: PageTabs })

export const PAGE_DIALOG_VIEWS = {
  [NEW_PAGE_DIALOG.id]: NewPageDialog,
  [PAGE_SETTINGS_DIALOG.id]: PageSettingsDialog,
}
