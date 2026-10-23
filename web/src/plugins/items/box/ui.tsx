// 箱の見た目: 箱のビューとアイコン、箱の追加と編集のダイアログ
import { definePluginUi } from "../../../ui/plugin"
import { BOX_PLUGIN } from "."
import { AddBoxDialog, EditBoxDialog } from "./BoxDialog"
import { BoxView } from "./BoxView"
import { BOX_ICON } from "./icons"

export const BOX_ITEM_UI = { view: BoxView, icon: BOX_ICON }
export const BOX_DIALOG_VIEWS = { "box.add": AddBoxDialog, "box.edit": EditBoxDialog }

export const BOX_UI = definePluginUi(BOX_PLUGIN, {
  items: { "shape.box": BOX_ITEM_UI },
  dialogViews: BOX_DIALOG_VIEWS,
})
