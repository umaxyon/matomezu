// 図面のプラグインの文言（ブックのタイプの名前と、各フォルダの文言を集めたもの）
import { defineMessages } from "../../../core/i18n/messages"
import { BOX_MESSAGES } from "./box/messages"
import { ITEMS_MESSAGES } from "./items/messages"
import { LINE_MESSAGES } from "./line/messages"
import { LIST_MESSAGES } from "./list/messages"
import { SETTINGS_MESSAGES } from "./settings/messages"
import { DRAWING_VIEW_MESSAGES } from "./view/messages"

export const DRAWING_MESSAGES = {
  ...defineMessages({
    "Sticky notes": { ja: "付箋紙" },
    Simple: { ja: "シンプル" },
    Drawing: { ja: "図面" },
  }),
  ...DRAWING_VIEW_MESSAGES,
  ...BOX_MESSAGES,
  ...LIST_MESSAGES,
  ...LINE_MESSAGES,
  ...ITEMS_MESSAGES,
  ...SETTINGS_MESSAGES,
}
