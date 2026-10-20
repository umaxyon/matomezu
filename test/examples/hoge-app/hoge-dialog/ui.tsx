// hoge の見た目を結ぶ: ダイアログの中身・中の「新しいブック」の差し替え・ステージに置くボタンのウィジェット
import { defineWidget } from "../../../../web/src/ui/layout"
import { definePluginUi } from "../../../../web/src/ui/plugin"
import { HOGE } from "."
import { HogeButtons } from "./HogeButtons"
import { HogeDialog, MyNewBookDialog } from "./HogeDialog"

export const HOGE_BUTTONS = defineWidget({
  id: "hoge/buttons",
  slots: ["stage.top", "stage.bottom"],
  view: HogeButtons,
})

export const HOGE_UI = definePluginUi(HOGE, {
  dialogViews: { "hoge/dialog": HogeDialog },
  widgets: [HOGE_BUTTONS],
  overrides: { dialogViews: { "book.new": MyNewBookDialog } },
})

declare module "../../../../web/src/ui/tables" {
  interface WidgetTable {
    "hoge/buttons": typeof HOGE_BUTTONS
  }
}
