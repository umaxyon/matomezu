// ページの見た目: ページのタブのウィジェットと、ページを作るダイアログ・ページの設定のダイアログ
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SIDE } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import { ADD_PAGE_MENU, NEW_PAGE_DIALOG, PAGE_CONTEXT, PAGE_DELETE_DIALOG, PAGE_SETTINGS_DIALOG } from "."
import { NewPageDialog } from "./NewPageDialog"
import { PageDeleteDialog } from "./PageDeleteDialog"
import { PageList } from "./PageList"
import { PageSettingsDialog } from "./PageSettingsDialog"
import { PageTabs } from "./PageTabs"

export const PAGE_TABS = defineWidget({
  id: kit.name("page-tabs"),
  slots: STAGE_SLOTS,
  contextMenus: [PAGE_CONTEXT, ADD_PAGE_MENU],
  view: PageTabs,
})

// ページ一覧（ステージの左の列。ページ一覧を選んだタイプのブックだけ描く）。ページの右クリックでメニュー page-context
export const PAGE_LIST = defineWidget({
  id: kit.name("page-list"),
  slots: [STAGE_SIDE],
  contextMenus: [PAGE_CONTEXT],
  view: PageList,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/base:page-context": { page: string } // ページ一覧のページ（右クリックしたページの id）
    "@matomezu/base:add-page-menu": { first: string | null } // 先頭に並べるタイプ（開いているページのタイプ。無ければ null）
  }
}

export const PAGE_DIALOG_VIEWS = {
  [PAGE_DELETE_DIALOG.id]: PageDeleteDialog,
  [NEW_PAGE_DIALOG.id]: NewPageDialog,
  [PAGE_SETTINGS_DIALOG.id]: PageSettingsDialog,
}
