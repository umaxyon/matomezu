// スライドのアイテムの見た目: 4 つのアイテムのビューとアイコン
import { definePluginUi } from "../../../plugin-api/ui"
import { SLIDE_PLUGIN } from "."
import { ELLIPSE_ICON, FREE_LINE_ICON, STRAIGHT_LINE_ICON, TEXT_FRAME_ICON } from "./icons"
import { EllipseView, FreeLineView, StraightLineView, TextFrameView } from "./SlideItemViews"
import { ELLIPSE, FREE_LINE, STRAIGHT_LINE, TEXT_FRAME } from "./slide"

export const SLIDE_UI = definePluginUi(SLIDE_PLUGIN, {
  items: {
    [TEXT_FRAME.id]: { view: TextFrameView, icon: TEXT_FRAME_ICON },
    [FREE_LINE.id]: { view: FreeLineView, icon: FREE_LINE_ICON },
    [STRAIGHT_LINE.id]: { view: StraightLineView, icon: STRAIGHT_LINE_ICON },
    [ELLIPSE.id]: { view: EllipseView, icon: ELLIPSE_ICON },
  },
})
