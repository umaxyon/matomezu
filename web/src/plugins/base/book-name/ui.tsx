// ブック名のウィジェット: ステージで開いているブックの名前と、乗ると上がるフッタメニュー（中は地図・履歴・基本・ブックの道具のスロット）。
// フッタメニューに置く地図（ミニマップと拡大縮小）・履歴（元に戻す・やり直す）・ステージのメニュー（stage-menu）のボタンのウィジェットも、ここで作る
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS } from "../workspace/ui"
import { BookName } from "./BookName"
import { FooterMenuMinimap } from "./FooterMenuMinimap"
import { FOOTER_MENU_SLOTS } from "./footer-menu"
import { HistoryButtons } from "./HistoryButtons"
import { STAGE_MENU } from "./menu"
import { StageMenuButtons } from "./StageMenuButtons"

export const BOOK_NAME = defineWidget({
  id: kit.name("book-name"),
  slots: STAGE_SLOTS,
  opens: FOOTER_MENU_SLOTS,
  view: BookName,
})

export const FOOTER_MENU_MINIMAP = defineWidget({
  id: kit.name("footer-menu-minimap"),
  slots: STAGE_SLOTS,
  view: FooterMenuMinimap,
})

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
