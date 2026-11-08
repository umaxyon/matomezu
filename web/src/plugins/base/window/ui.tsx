// 窓の見た目: 根に置いて、ブックスクリーンとコントロールセンターのスロットを開けるウィジェット window と、止まり木のボタン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { PerchButton } from "./PerchButton"
import { BOOK_SCREEN, CONTROL_CENTER_FOOTER, CONTROL_CENTER_SCREEN } from "./slots"
import { WindowView } from "./WindowView"

export const WINDOW = defineWidget({
  id: kit.name("window"),
  slots: ["root"],
  opens: [BOOK_SCREEN, CONTROL_CENTER_SCREEN, CONTROL_CENTER_FOOTER],
  view: WindowView,
})

export const CONTROL_CENTER_PERCH = defineWidget({
  id: kit.name("control-center-perch"),
  slots: [CONTROL_CENTER_FOOTER],
  view: PerchButton,
})
