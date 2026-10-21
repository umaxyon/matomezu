// 土台のプラグインの文言（各フォルダの文言を集めたもの）
import { BOOK_OPEN_MESSAGES } from "./book-open/messages"
import { LOOKS_MESSAGES } from "./looks/messages"
import { PAGE_MESSAGES } from "./page-tabs/messages"
import { SETTINGS_MESSAGES } from "./settings/messages"
import { STAGE_MESSAGES } from "./stage/messages"
import { TOOL_SWITCH_MESSAGES } from "./tool-switch/messages"

export const BASE_MESSAGES = {
  ...STAGE_MESSAGES,
  ...TOOL_SWITCH_MESSAGES,
  ...BOOK_OPEN_MESSAGES,
  ...PAGE_MESSAGES,
  ...SETTINGS_MESSAGES,
  ...LOOKS_MESSAGES,
}
