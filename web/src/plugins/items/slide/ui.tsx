// スライドのアイテムの見た目: 4 つのアイテムのビューとアイコン
import { definePluginUi, defineWidget } from "../../../plugin-api/ui"
import { SLIDE_PLUGIN } from "."
import { ELLIPSE_ICON, FREE_LINE_ICON, STRAIGHT_LINE_ICON, TEXT_FRAME_ICON } from "./icons"
import { kit } from "./kit"
import { EllipseView, FreeLineView, StraightLineView, TextFrameView } from "./SlideItemViews"
import { SLIDE_ITEM_CONTEXT } from "./scope"
import { ELLIPSE, FREE_LINE, STRAIGHT_LINE, TEXT_FRAME } from "./slide"
import { SlideLayer } from "./view/SlideLayer"
import { SlideSheet } from "./view/SlideSheet"

// スライドのレイヤー: ブックのタイプが slide を選んでいるブックで、スライドのアイテムを描いて操作を受ける
export const SLIDE_LAYER = defineWidget({
  id: kit.name("slide-layer"),
  slots: ["@matomezu/base:book-layers"],
  contextMenus: [SLIDE_ITEM_CONTEXT],
  view: SlideLayer,
})

// スライドの印刷区画のレイヤー: ページの slide のアイテムを、ブックの中身の下に見るだけで描く（印刷プレビュー・印刷・ページ一覧のサムネイル）
export const SLIDE_SHEET = defineWidget({
  id: kit.name("slide-sheet"),
  slots: ["@matomezu/base:sheet-layers"],
  view: SlideSheet,
})

export const SLIDE_UI = definePluginUi(SLIDE_PLUGIN, {
  items: {
    [TEXT_FRAME.id]: { view: TextFrameView, icon: TEXT_FRAME_ICON },
    [FREE_LINE.id]: { view: FreeLineView, icon: FREE_LINE_ICON },
    [STRAIGHT_LINE.id]: { view: StraightLineView, icon: STRAIGHT_LINE_ICON },
    [ELLIPSE.id]: { view: EllipseView, icon: ELLIPSE_ICON },
  },
  widgets: [SLIDE_LAYER, SLIDE_SHEET],
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/slide:item-context": { item: string } // スライドのアイテム（右クリックしたアイテムの id）
  }
  interface WidgetTable {
    "@matomezu/slide:slide-layer": typeof SLIDE_LAYER
    "@matomezu/slide:slide-sheet": typeof SLIDE_SHEET
  }
}
