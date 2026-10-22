// リストの見た目: リストのビューとアイコン、リストの追加と設定のダイアログ、行の追加と編集のダイアログ
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

export const LIST_UI = { view: ListView, icon: LIST_ICON }
export const LIST_DIALOG_VIEWS = {
  "list.add": AddListDialog,
  "list.edit": EditListDialog,
  "row.add": AddRowDialog,
  "row.edit": EditRowDialog,
}
