// ページの見た目: ページのタブのウィジェットと、ページを作るダイアログ・ページの設定のダイアログ

import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { GEAR_ICON } from "../utils/gear-icon"
import { STAGE_SIDE } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import {
  ADD_PAGE_MENU,
  FOLDER_CONTEXT,
  FOLDER_DELETE_DIALOG,
  FOLDER_SETTINGS_DIALOG,
  FOLDER_SETTINGS_OPENED,
  NEW_PAGE_DIALOG,
  PAGE_CONTEXT,
  PAGE_DELETE_DIALOG,
  PAGE_LIST_CONTEXT,
  PAGE_SETTINGS,
  PAGE_SETTINGS_DIALOG,
} from "."
import { FolderDeleteDialog } from "./FolderDeleteDialog"
import { FolderSettingsDialog } from "./FolderSettingsDialog"
import { NewPageDialog } from "./NewPageDialog"
import { PageDeleteDialog } from "./PageDeleteDialog"
import { PageList } from "./PageList"
import { PageSettingsDialog } from "./PageSettingsDialog"
import { PageTabs } from "./PageTabs"

export const PAGE_TABS = defineWidget({
  id: kit.name("page-tabs"),
  slots: STAGE_SLOTS,
  contextMenus: [PAGE_CONTEXT, FOLDER_CONTEXT, ADD_PAGE_MENU],
  view: PageTabs,
})

// ページ一覧（ステージの左の列。フォルダにまとまるタイプのページを開いている間だけ描く）。ページの右クリックでメニュー page-list-context
export const PAGE_LIST = defineWidget({
  id: kit.name("page-list"),
  slots: [STAGE_SIDE],
  contextMenus: [PAGE_LIST_CONTEXT],
  view: PageList,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/base:page-context": { page: string } // ページタブのページ（右クリックしたページの id）
    "@matomezu/base:folder-context": { folder: string } // ページタブのフォルダ（右クリックしたフォルダの id）
    "@matomezu/base:page-list-context": { page: string } // ページ一覧のページ（右クリックしたページの id）
    "@matomezu/base:add-page-menu": { first: string | null } // 先頭に並べるタイプ（開いているページのタイプ。無ければ null）
  }
}

// 開いている物（ページかフォルダ）の設定を開くコマンドのアイコン
export const PAGE_SETTINGS_ICONS = {
  [PAGE_SETTINGS.id]: GEAR_ICON,
  [FOLDER_SETTINGS_OPENED.id]: GEAR_ICON,
}

export const PAGE_DIALOG_VIEWS = {
  [PAGE_DELETE_DIALOG.id]: PageDeleteDialog,
  [FOLDER_SETTINGS_DIALOG.id]: FolderSettingsDialog,
  [FOLDER_DELETE_DIALOG.id]: FolderDeleteDialog,
  [NEW_PAGE_DIALOG.id]: NewPageDialog,
  [PAGE_SETTINGS_DIALOG.id]: PageSettingsDialog,
}
