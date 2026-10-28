// 箱の見た目: 箱と内包ボックスのビューとアイコン（同じ）、追加と編集のダイアログ
import { definePluginUi } from "../../../plugin-api/ui"
import { BOX_PLUGIN } from "."
import { AddBoxDialog, AddNestBoxDialog, EditBoxDialog } from "./BoxDialog"
import { BoxView } from "./BoxView"
import { BOX, BOX_ADD_DIALOG, BOX_EDIT_DIALOG, NEST_BOX, NEST_BOX_ADD_DIALOG } from "./box"
import { BOX_ICON } from "./icons"

export const BOX_ITEM_UI = { view: BoxView, icon: BOX_ICON }
export const BOX_DIALOG_VIEWS = {
  [BOX_ADD_DIALOG.id]: AddBoxDialog,
  [BOX_EDIT_DIALOG.id]: EditBoxDialog,
  [NEST_BOX_ADD_DIALOG.id]: AddNestBoxDialog,
}

export const BOX_UI = definePluginUi(BOX_PLUGIN, {
  items: { [BOX.id]: BOX_ITEM_UI, [NEST_BOX.id]: BOX_ITEM_UI },
  dialogViews: BOX_DIALOG_VIEWS,
})
