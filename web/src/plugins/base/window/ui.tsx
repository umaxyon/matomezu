// 窓の見た目: 根に置いて、ブックスクリーンとコントロールセンターのスロットを開けるウィジェット window と、止まり木のボタン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { ONE_SCREEN } from "."
import { OneScreenView } from "./OneScreenView"
import { PerchButton } from "./PerchButton"
import { CONTROL_CENTER_FOOTER } from "./slots"
import { WindowView } from "./WindowView"

export const WINDOW = defineWidget({
  id: kit.name("window"),
  slots: ["root"],
  screenArrangements: true,
  view: WindowView,
})

// スクリーンアレンジメント「1 枚ずつ」のウィジェット。その定義（ONE_SCREEN）の id と同じ名前のスロットに置き、スクリーンを描く所と下の行のスロットを開ける
export const ONE_SCREEN_WIDGET = defineWidget({
  id: kit.name("one-screen-view"),
  slots: [ONE_SCREEN.id],
  opens: [CONTROL_CENTER_FOOTER],
  screens: true,
  view: OneScreenView,
})

export const CONTROL_CENTER_PERCH = defineWidget({
  id: kit.name("control-center-perch"),
  slots: [CONTROL_CENTER_FOOTER],
  view: PerchButton,
})
