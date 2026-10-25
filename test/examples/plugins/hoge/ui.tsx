// hoge の見た目を結ぶ: ダイアログの中身・中の「新しいブック」の差し替え・ステージに置くボタンのウィジェット
import { definePluginUi, defineWidget } from "matomezu/ui"
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

// ホストが動的に取り込むときは、default で出した見た目を結んだプラグインを受け取る
export default HOGE_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "hoge/buttons": typeof HOGE_BUTTONS
  }
}
