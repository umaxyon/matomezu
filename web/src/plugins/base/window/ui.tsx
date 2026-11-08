// 窓の見た目: 根に置いて、ブックスクリーンとコントロールセンターのスロットを開けるウィジェット
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { BOOK_SCREEN, CONTROL_CENTER_SCREEN } from "./slots"
import { WindowView } from "./WindowView"

export const WINDOW = defineWidget({
  id: kit.name("window"),
  slots: ["root"],
  opens: [BOOK_SCREEN, CONTROL_CENTER_SCREEN],
  view: WindowView,
})
