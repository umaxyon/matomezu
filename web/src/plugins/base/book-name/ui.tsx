// ブック名のウィジェット: ステージで開いているブックの名前と、乗ると上がるドロワー（中は地図・基本・ブックの道具のスロット）。
// ドロワーに置く地図（ミニマップと拡大縮小）・履歴（元に戻す・やり直す）・ステージのメニュー（stage-menu）のボタンのウィジェットも、ここで作る
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS } from "../workspace/ui"
import { BookName } from "./BookName"
import { DrawerMinimap } from "./DrawerMinimap"
import { DRAWER_SLOTS } from "./drawer"
import { HistoryButtons } from "./HistoryButtons"
import { STAGE_MENU } from "./menu"
import { StageMenuButtons } from "./StageMenuButtons"

export const BOOK_NAME = defineWidget({
  id: kit.name("book-name"),
  slots: STAGE_SLOTS,
  opens: DRAWER_SLOTS,
  view: BookName,
})

export const DRAWER_MINIMAP = defineWidget({ id: kit.name("drawer-minimap"), slots: STAGE_SLOTS, view: DrawerMinimap })

export const STAGE_MENU_BUTTONS = defineWidget({
  id: kit.name("stage-menu-buttons"),
  slots: STAGE_SLOTS,
  menus: [STAGE_MENU],
  view: StageMenuButtons,
})

export const HISTORY_BUTTONS = defineWidget({
  id: kit.name("history-buttons"),
  slots: STAGE_SLOTS,
  view: HistoryButtons,
})
