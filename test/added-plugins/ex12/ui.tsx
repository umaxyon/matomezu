// ex12 の見た目を結ぶ: スクリーンアレンジメントとスクリーンを描くウィジェットは、その定義の id と同じ名前のスロットに置ける（自分の定義なので、place を書かなくてもそこに置かれる）
import { definePluginUi, defineWidget } from "matomezu/ui"
import { EX12, EX12_PANEL, EX12_STACK } from "."
import { kit } from "./kit"
import { Ex12Panel, Ex12Stack, Ex12Switch } from "./views"

// 縦に並べるスクリーンアレンジメントを描く。スクリーンを置くので、スクリーンの定義ごとのスロットを開ける（screens）
export const EX12_STACK_VIEW = defineWidget({
  id: kit.name("stack-view"),
  slots: [EX12_STACK.id],
  screens: true,
  view: Ex12Stack,
})

export const EX12_PANEL_VIEW = defineWidget({
  id: kit.name("panel-view"),
  slots: [EX12_PANEL.id],
  view: Ex12Panel,
})

export const EX12_SWITCH = defineWidget({
  id: kit.name("switch"),
  slots: ["@matomezu/base:stage-top"],
  place: "@matomezu/base:stage-top",
  view: Ex12Switch,
})

export const EX12_UI = definePluginUi(EX12, { widgets: [EX12_STACK_VIEW, EX12_PANEL_VIEW, EX12_SWITCH] })

export default EX12_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "ex12:stack-view": typeof EX12_STACK_VIEW
    "ex12:panel-view": typeof EX12_PANEL_VIEW
    "ex12:switch": typeof EX12_SWITCH
  }
}
