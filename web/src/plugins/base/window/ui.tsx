// 窓の見た目: 根に置いて、ブックスクリーンとコントロールセンターのスロットを開けるウィジェット window
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { ONE_SCREEN } from "."
import { ScreensView } from "./ScreensView"
import { SCREEN_FOOTER } from "./slots"
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
export const SCREENS_WIDGET = defineWidget({
  id: kit.name("screens-view"),
  slots: [ONE_SCREEN.id, SPLIT_ROWS.id],
  opens: [SCREEN_FOOTER],
  screens: true,
  view: ScreensView,
})

export { WINDOW_ICONS } from "./icons"
export { useControlCenterMaximize, useControlCenterMaximized } from "./maximize"
export { useShowControlCenter } from "./show-control-center"
export { BOOK_SCREEN, SCREEN_FOOTER } from "./slots"
export { type BookOpenChoiceOptions, useBookOpenChoice } from "./useBookOpenChoice"
export { type ScreenSplit, useScreenSplit } from "./useScreenSplit"
export { type BookShower, useShowBook } from "./useShowBook"
