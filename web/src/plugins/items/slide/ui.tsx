// スライドのアイテムの見た目: 4 つのアイテムのビューとアイコン
import { definePluginUi, defineWidget } from "../../../plugin-api/ui"
import { SLIDE_PLUGIN } from "."
import { ELLIPSE_ICON, FREE_LINE_ICON, STRAIGHT_LINE_ICON, TEXT_FRAME_ICON } from "./icons"
import { kit } from "./kit"
import { EllipseView, FreeLineView, StraightLineView, TextFrameView } from "./SlideItemViews"
import { ELLIPSE, FREE_LINE, STRAIGHT_LINE, TEXT_FRAME } from "./slide"
import { SlideLayer } from "./view/SlideLayer"

// スライドのレイヤー: ブックのタイプが slide を選んでいるブックで、スライドのアイテムを描いて操作を受ける
export const SLIDE_LAYER = defineWidget({
  id: kit.name("slide-layer"),
  slots: ["@matomezu/base:book-layers"],
  view: SlideLayer,
})

export const SLIDE_UI = definePluginUi(SLIDE_PLUGIN, {
  items: {
    [TEXT_FRAME.id]: { view: TextFrameView, icon: TEXT_FRAME_ICON },
    [FREE_LINE.id]: { view: FreeLineView, icon: FREE_LINE_ICON },
    [STRAIGHT_LINE.id]: { view: StraightLineView, icon: STRAIGHT_LINE_ICON },
    [ELLIPSE.id]: { view: EllipseView, icon: ELLIPSE_ICON },
  },
  widgets: [SLIDE_LAYER],
})

declare module "../../../core/catalog" {
  interface WidgetTable {
    "@matomezu/slide:slide-layer": typeof SLIDE_LAYER
  }
}
