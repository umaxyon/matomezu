// 箱の見た目: 箱のビューとアイコン、箱の追加のダイアログ
import { AddBoxDialog } from "./AddBoxDialog"
import { BoxView } from "./BoxView"
import { BOX_ICON } from "./icons"

export const BOX_UI = { view: BoxView, icon: BOX_ICON }
export const BOX_DIALOG_VIEWS = { "box.add": AddBoxDialog }
