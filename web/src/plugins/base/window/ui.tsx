// 窓の見た目: 根に置いて、ブックスクリーンとコントロールセンターのスロットを開けるウィジェット window と、巣箱のボタン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { ONE_SCREEN } from "."
import { BirdhouseButton } from "./BirdhouseButton"
import { OneScreenView } from "./OneScreenView"
import { CONTROL_CENTER_FOOTER } from "./slots"
import { SPLIT_ROWS } from "./split"
import { WindowView } from "./WindowView"

export const WINDOW = defineWidget({
  id: kit.name("window"),
  slots: ["root"],
  screenArrangements: true,
  view: WindowView,
})

// スクリーンアレンジメント「1 枚ずつ」と「上下に分ける」のウィジェット。その定義（ONE_SCREEN・SPLIT_ROWS）の id と同じ名前のスロットに置き、スクリーンを描く所と下の行のスロットを開ける
// （同じウィジェットなので、見せ方を替えても描き直さず、中のスクリーンの状態が残る）
export const ONE_SCREEN_WIDGET = defineWidget({
  id: kit.name("one-screen-view"),
  slots: [ONE_SCREEN.id, SPLIT_ROWS.id],
  opens: [CONTROL_CENTER_FOOTER],
  screens: true,
  view: OneScreenView,
})

export const CONTROL_CENTER_BIRDHOUSE = defineWidget({
  id: kit.name("control-center-birdhouse"),
  slots: [CONTROL_CENTER_FOOTER],
  view: BirdhouseButton,
})
