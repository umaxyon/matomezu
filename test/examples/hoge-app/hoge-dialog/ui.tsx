// hoge の見た目を結ぶ
import { definePluginUi } from "../../../../web/src/ui/plugin"
import { HOGE } from "."
import { HogeDialog, MyNewBookDialog } from "./HogeDialog"

export const HOGE_UI = definePluginUi(HOGE, {
  dialogViews: { "hoge/dialog": HogeDialog },
  overrides: { dialogViews: { "book.new": MyNewBookDialog } },
})
