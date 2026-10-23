// リストの見た目: リストのビューとアイコン、リストの追加と設定のダイアログ、行の追加と編集のダイアログ。
// 末尾で、リストのビューが開く行の右クリックのメニューを型の表に書き足す
import { definePluginUi } from "../../../ui/plugin"
import { LIST_PLUGIN } from "."
import { AddListDialog, EditListDialog } from "./ListDialog"
import { ListView } from "./ListView"
import { AddRowDialog, EditRowDialog } from "./RowDialog"

// ツールボックスのアイコン（見出しの帯と、点の付いた行）
const LIST_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M4 8.5h16M8 12.5h8M8 16h8" />
  </svg>
)

export const LIST_ITEM_UI = { view: ListView, icon: LIST_ICON, contextMenus: ["row.context"] } as const
export const LIST_DIALOG_VIEWS = {
  "list.add": AddListDialog,
  "list.edit": EditListDialog,
  "row.add": AddRowDialog,
  "row.edit": EditRowDialog,
}

export const LIST_UI = definePluginUi(LIST_PLUGIN, {
  items: { "shape.list": LIST_ITEM_UI },
  dialogViews: LIST_DIALOG_VIEWS,
})

declare module "../../../ui/tables" {
  interface ContextMenuTable {
    "row.context": { list: string; row: string } // リストの行（右クリックした行と、そのリストの id）
  }
}
