// スライドのページの見た目: スライドのビュー（プレゼンテーション slide）
import { definePluginUi } from "../../../plugin-api/ui"
import { SLIDE_PAGE_PLUGIN } from "."
import { SLIDE_PAGE_NODE_ICON } from "./node-icon"
import { SLIDE_PRINT } from "./print-setting"
import { SlidePrintSetting } from "./SlidePrintSetting"
import { SLIDE_PAGE, SLIDE_PRESENTATION } from "./slide-page"
import { SlideIcon } from "./type-icon"
import { SlideView } from "./view/ui"

export const SLIDE_PAGE_UI = definePluginUi(SLIDE_PAGE_PLUGIN, {
  pageTypeIcons: { [SLIDE_PAGE.id]: <SlideIcon /> },
  enumValueIcons: { [SLIDE_PAGE_NODE_ICON.id]: <SlideIcon /> },
  settingViews: { [SLIDE_PRINT.id]: { control: SlidePrintSetting } },
  presentationViews: { [SLIDE_PRESENTATION.id]: { view: SlideView } },
})
