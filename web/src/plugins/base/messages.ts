// base の文言（各フォルダの文言を集めたもの）
import { BOOK_LOOK_MESSAGES } from "./book-look/messages"
import { BOOK_NEW_MESSAGES } from "./book-new/messages"
import { BOOK_OPEN_MESSAGES } from "./book-open/messages"
import { MENU_MESSAGES } from "./context-menu/messages"
import { DIALOG_MESSAGES } from "./dialog-host/messages"
import { ITEM_PARTS_MESSAGES } from "./item-parts/messages"
import { LOOKS_MESSAGES } from "./looks/messages"
import { MINIMAP_MESSAGES } from "./minimap/messages"
import { PAGE_MESSAGES } from "./page-tabs/messages"
import { SETTINGS_MESSAGES } from "./settings/messages"
import { STAGE_MESSAGES } from "./stage/messages"
import { TOOL_PICKER_MESSAGES } from "./tool-picker/messages"
import { TOOL_SWITCH_MESSAGES } from "./tool-switch/messages"
import { TOOLBOX_MESSAGES } from "./toolbox/messages"
import { ELAPSED_MESSAGES } from "./utils/messages"

export const BASE_MESSAGES = {
  ...STAGE_MESSAGES,
  ...TOOL_SWITCH_MESSAGES,
  ...TOOL_PICKER_MESSAGES,
  ...MINIMAP_MESSAGES,
  ...TOOLBOX_MESSAGES,
  ...DIALOG_MESSAGES,
  ...MENU_MESSAGES,
  ...BOOK_OPEN_MESSAGES,
  ...BOOK_LOOK_MESSAGES,
  ...BOOK_NEW_MESSAGES,
  ...PAGE_MESSAGES,
  ...SETTINGS_MESSAGES,
  ...LOOKS_MESSAGES,
  ...ITEM_PARTS_MESSAGES,
  ...ELAPSED_MESSAGES,
}
