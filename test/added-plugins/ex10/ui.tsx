// ex10 の見た目を結ぶ: ステージの上の行に置いてほしいタブ
import { definePluginUi, defineWidget } from "matomezu/ui"
import { EX10 } from "."
import { kit } from "./kit"
import { Ex10Tabs } from "./views"

export const EX10_TABS = defineWidget({
  id: kit.name("tabs"),
  slots: ["@matomezu/base:stage-top"],
  place: "@matomezu/base:stage-top",
  view: Ex10Tabs,
})

export const EX10_UI = definePluginUi(EX10, { widgets: [EX10_TABS] })

export default EX10_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "ex10:tabs": typeof EX10_TABS
  }
}
