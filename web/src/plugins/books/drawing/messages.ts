// 図面のプラグインの文言（ブックのタイプの名前と、各フォルダの文言を集めたもの）
import { defineMessages } from "../../../core/i18n/messages"
import { BOX_MESSAGES } from "./box/messages"
import { DRAWING_VIEW_MESSAGES } from "./view/messages"

export const DRAWING_MESSAGES = {
  ...defineMessages({
    Drawing: { ja: "図面" },
  }),
  ...DRAWING_VIEW_MESSAGES,
  ...BOX_MESSAGES,
}
