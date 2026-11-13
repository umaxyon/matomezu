// 窓の見た目: 根に置いて、ブックスクリーンとコントロールセンターのスロットを開けるウィジェット window と、止まり木のボタン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { PerchButton } from "./PerchButton"
import { CONTROL_CENTER_FOOTER } from "./slots"
import { WindowView } from "./WindowView"

export const WINDOW = defineWidget({
  id: kit.name("window"),
  slots: ["root"],
  opens: [CONTROL_CENTER_FOOTER],
  screens: true,
  view: WindowView,
})

export const CONTROL_CENTER_PERCH = defineWidget({
  id: kit.name("control-center-perch"),
  slots: [CONTROL_CENTER_FOOTER],
  view: PerchButton,
})
