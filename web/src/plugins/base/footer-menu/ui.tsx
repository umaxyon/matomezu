// フッタメニューに置く地図（ミニマップと拡大縮小）・履歴（元に戻す・やり直す）・ステージのメニュー（stage-menu）のボタンのウィジェット。
// フッタメニューそのもの（スロットを並べて上げ下げする所）は、ブック名のウィジェット（book-name）が開く
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS } from "../workspace/ui"
import { FooterMenuMinimap } from "./FooterMenuMinimap"
import { HistoryButtons } from "./HistoryButtons"
import { STAGE_MENU } from "./menu"
import { StageMenuButtons } from "./StageMenuButtons"

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
