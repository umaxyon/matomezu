// 図面のプラグインの見た目: 図面のビュー、箱のビューとアイコンと追加のダイアログ、設定のダイアログ（各フォルダの見た目を集める）。
// 末尾で、図面のビューが開く右クリックのメニューを型の表に書き足す
import { definePluginUi } from "../../../ui/plugin"
import { DRAWING_PLUGIN } from "."
import { BOX_DIALOG_VIEWS, BOX_UI } from "./box/ui"
import { SETTINGS_DIALOG_VIEWS } from "./settings/ui"
import { DRAWING_VIEW } from "./view/ui"

export const DRAWING_UI = definePluginUi(DRAWING_PLUGIN, {
  bookViews: { drawing: DRAWING_VIEW },
  items: { "shape.box": BOX_UI },
  dialogViews: { ...SETTINGS_DIALOG_VIEWS, ...BOX_DIALOG_VIEWS },
})

declare module "../../../ui/tables" {
  interface ContextMenuTable {
    "drawing.context": Record<string, never> // 図面の画面（何も受け取らない）
    "box.context": { item: string } // 置いたアイテム（右クリックしたアイテムの id）
  }
}
