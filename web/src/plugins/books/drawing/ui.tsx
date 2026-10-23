// 図面のプラグインの見た目: 図面のビュー、箱とリストのビューとアイコンとダイアログ、設定のダイアログ（各フォルダの見た目を集める）。
// 末尾で、図面のビューが開く右クリックのメニューを型の表に書き足す
import { definePluginUi } from "../../../ui/plugin"
import { DRAWING_PLUGIN } from "."
import { BOX_DIALOG_VIEWS, BOX_UI } from "./box/ui"
import { LINE_DIALOG_VIEWS, LINE_SETTING_VIEWS, LINE_UI } from "./line/ui"
import { LIST_DIALOG_VIEWS, LIST_UI } from "./list/ui"
import { DRAWING_VIEW } from "./view/ui"

export const DRAWING_UI = definePluginUi(DRAWING_PLUGIN, {
  bookViews: { drawing: DRAWING_VIEW },
  items: { "shape.box": BOX_UI, "shape.list": LIST_UI },
  connectors: { "connector.line": LINE_UI },
  settingViews: LINE_SETTING_VIEWS,
  dialogViews: { ...BOX_DIALOG_VIEWS, ...LIST_DIALOG_VIEWS, ...LINE_DIALOG_VIEWS },
})

declare module "../../../ui/tables" {
  interface ContextMenuTable {
    "drawing.context": Record<string, never> // 図面の画面（何も受け取らない）
    "item.context": { item: string } // 置いたアイテム（右クリックしたアイテムの id）
    "row.context": { list: string; row: string } // リストの行（右クリックした行と、そのリストの id）
    "line.context": { item: string } // 線（右クリックした線の id）
  }
}
