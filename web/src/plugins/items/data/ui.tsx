// データの見た目: データのビューとアイコン、編集のダイアログ
import { definePluginUi } from "../../../plugin-api/ui"
import { DATA_PLUGIN } from "."
import { EditDataDialog } from "./DataDialog"
import { DataItemView } from "./DataItemView"
import { DATA, DATA_EDIT_DIALOG } from "./data"

// ツールボックスのアイコン（見出しの行と罫線の表）
const DATA_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
    <path d="M4 9.5h16M4 14h16M10 5v14" />
  </svg>
)

export const DATA_UI = definePluginUi(DATA_PLUGIN, {
  items: { [DATA.id]: { view: DataItemView, icon: DATA_ICON } },
  dialogViews: { [DATA_EDIT_DIALOG.id]: EditDataDialog },
})
