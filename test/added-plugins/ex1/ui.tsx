// ex1 の見た目を結ぶ: ダイアログの中身・ビルトインのページの設定の差し替え・ステージの上の行に置いてほしいボタン・コマンドのアイコン
import { definePluginUi, defineWidget } from "matomezu/ui"
import { EX1 } from "."
import { Ex1Buttons, HELLO_ICON, HelloDialog, InspectDialog, PageSettingsInstead } from "./views"

export const EX1_BUTTONS = defineWidget({
  id: "ex1/buttons",
  slots: ["stage.top", "stage.bottom"],
  place: "stage.top",
  view: Ex1Buttons,
})

export const EX1_UI = definePluginUi(EX1, {
  dialogViews: { "ex1/hello": HelloDialog, "ex1/inspect": InspectDialog },
  widgets: [EX1_BUTTONS],
  commandIcons: { "ex1/hello": HELLO_ICON },
  overrides: { dialogViews: { "page.settings": PageSettingsInstead } },
})

export default EX1_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "ex1/buttons": typeof EX1_BUTTONS
  }
}
