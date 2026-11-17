// スライドのブックの見た目: スライドのビュー（プレゼンテーション slide）
import { definePluginUi } from "../../../plugin-api/ui"
import { SLIDE_BOOK_PLUGIN } from "."
import { SLIDE_BOOK_ENTRY_ICON } from "./entry-icon"
import { SLIDE_PRINT } from "./print-setting"
import { SlidePrintSetting } from "./SlidePrintSetting"
import { SLIDE_BOOK, SLIDE_PRESENTATION } from "./slide-book"
import { SlideIcon } from "./type-icon"
import { SlideView } from "./view/SlideView"

export const SLIDE_BOOK_UI = definePluginUi(SLIDE_BOOK_PLUGIN, {
  pageTypeIcons: { [SLIDE_BOOK.id]: <SlideIcon /> },
  enumValueIcons: { [SLIDE_BOOK_ENTRY_ICON.id]: <SlideIcon /> },
  settingViews: { [SLIDE_PRINT.id]: { control: SlidePrintSetting } },
  presentationViews: { [SLIDE_PRESENTATION.id]: { view: SlideView } },
})
