// 土台のプラグインの文言（各フォルダの文言を集めたもの）
import { BOOK_OPEN_MESSAGES } from "./book-open/messages"
import { MENU_MESSAGES } from "./context-menu/messages"
import { DIALOG_MESSAGES } from "./dialog-host/messages"
import { LOOKS_MESSAGES } from "./looks/messages"
import { PAGE_MESSAGES } from "./page-tabs/messages"
import { SETTINGS_MESSAGES } from "./settings/messages"
import { STAGE_MESSAGES } from "./stage/messages"
import { TOOL_SWITCH_MESSAGES } from "./tool-switch/messages"
import { TOOLBOX_MESSAGES } from "./toolbox/messages"

export const BASE_MESSAGES = {
  ...STAGE_MESSAGES,
  ...TOOL_SWITCH_MESSAGES,
  ...TOOLBOX_MESSAGES,
  ...DIALOG_MESSAGES,
  ...MENU_MESSAGES,
  ...BOOK_OPEN_MESSAGES,
  ...PAGE_MESSAGES,
  ...SETTINGS_MESSAGES,
  ...LOOKS_MESSAGES,
}
