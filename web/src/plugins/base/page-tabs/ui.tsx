// ページの見た目: ページのタブのウィジェットと、ページを作るダイアログ・ページの設定のダイアログ

import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { GEAR_ICON } from "../utils/gear-icon"
import { STAGE_SIDE } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import {
  ADD_PAGE_MENU,
  BINDER_CONTEXT,
  BINDER_DELETE_DIALOG,
  BINDER_SETTINGS_DIALOG,
  BINDER_SETTINGS_OPENED,
  NEW_PAGE_DIALOG,
  PAGE_CONTEXT,
  PAGE_DELETE_DIALOG,
  PAGE_LIST_CONTEXT,
  PAGE_SETTINGS,
  PAGE_SETTINGS_DIALOG,
} from "."
import { BinderDeleteDialog } from "./BinderDeleteDialog"
import { BinderSettingsDialog } from "./BinderSettingsDialog"
import { NewPageDialog } from "./NewPageDialog"
import { PageDeleteDialog } from "./PageDeleteDialog"
import { PageList } from "./PageList"
import { PageSettingsDialog } from "./PageSettingsDialog"
import { PageTabs } from "./PageTabs"

export const PAGE_TABS = defineWidget({
  id: kit.name("page-tabs"),
  slots: STAGE_SLOTS,
  contextMenus: [PAGE_CONTEXT, BINDER_CONTEXT, ADD_PAGE_MENU],
  view: PageTabs,
})

// ページ一覧（ステージの左の列。バインダにまとまるタイプのページを開いている間だけ描く）。ページの右クリックでメニュー page-list-context
export const PAGE_LIST = defineWidget({
  id: kit.name("page-list"),
  slots: [STAGE_SIDE],
  contextMenus: [PAGE_LIST_CONTEXT],
  view: PageList,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/base:page-context": { page: string } // ページタブのページ（右クリックしたページの id）
    "@matomezu/base:binder-context": { binder: string } // ページタブのバインダ（右クリックしたバインダの id）
    "@matomezu/base:page-list-context": { page: string } // ページ一覧のページ（右クリックしたページの id）
    "@matomezu/base:add-page-menu": { first: string | null } // 先頭に並べるタイプ（開いているページのタイプ。無ければ null）
  }
}

// 開いている物（ページかバインダ）の設定を開くコマンドのアイコン
export const PAGE_SETTINGS_ICONS = {
  [PAGE_SETTINGS.id]: GEAR_ICON,
  [BINDER_SETTINGS_OPENED.id]: GEAR_ICON,
}

export const PAGE_DIALOG_VIEWS = {
  [PAGE_DELETE_DIALOG.id]: PageDeleteDialog,
  [BINDER_SETTINGS_DIALOG.id]: BinderSettingsDialog,
  [BINDER_DELETE_DIALOG.id]: BinderDeleteDialog,
  [NEW_PAGE_DIALOG.id]: NewPageDialog,
  [PAGE_SETTINGS_DIALOG.id]: PageSettingsDialog,
}
