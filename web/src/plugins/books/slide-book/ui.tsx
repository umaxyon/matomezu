// スライドのブックの見た目: スライドのビュー（見せ方 slide）
import { definePluginUi } from "../../../plugin-api/ui"
import { SLIDE_BOOK_PLUGIN } from "."
import { SLIDE_PRINT } from "./print-setting"
import { SlidePrintSetting } from "./SlidePrintSetting"
import { SlideSheet } from "./SlideSheet"
import { SlideView } from "./SlideView"
import { SLIDE_PRESENTATION } from "./slide-book"

export const SLIDE_BOOK_UI = definePluginUi(SLIDE_BOOK_PLUGIN, {
  settingViews: { [SLIDE_PRINT.id]: { control: SlidePrintSetting } },
  presentationViews: { [SLIDE_PRESENTATION.id]: { view: SlideView, printSheet: SlideSheet } },
})
