// base の文言（各フォルダの文言を集めたもの）
import { BOOK_LOOK_MESSAGES } from "./book-look/messages"
import { BOOK_NEW_MESSAGES } from "./book-new/messages"
import { MENU_MESSAGES } from "./context-menu/messages"
import { CORNER_MESSAGES } from "./corner-status/messages"
import { DIALOG_MESSAGES } from "./dialog-host/messages"
import { HISTORY_MESSAGES } from "./history/messages"
import { ITEM_PARTS_MESSAGES } from "./item-parts/messages"
import { LEFT_SIDE_PANEL_MESSAGES } from "./left-side-panel/messages"
import { LIBRARY_MESSAGES } from "./library/messages"
import { LOCK_MESSAGES } from "./lock/messages"
import { LOOKS_MESSAGES } from "./looks/messages"
import { MAIL_MESSAGES } from "./mail/messages"
import { MARK_MESSAGES } from "./mark/messages"
import { MARKDOWN_DOCUMENT_MESSAGES } from "./markdown/messages"
import { MINIMAP_MESSAGES } from "./minimap/messages"
import { NOTE_MESSAGES } from "./note/messages"
import { OPEN_GUIDE_MESSAGES } from "./open-guide/messages"
import { OUTBOX_MESSAGES } from "./outbox/messages"
import { PAGE_MESSAGES } from "./page-tabs/messages"
import { PARTICIPANT_MESSAGES } from "./participant/messages"
import { PRINT_PREVIEW_MESSAGES } from "./print-preview/messages"
import { RIGHT_SIDE_PANEL_MESSAGES } from "./right-side-panel/messages"
import { SCRAP_MESSAGES } from "./scrap/messages"
import { SEARCH_MESSAGES } from "./search/messages"
import { SETTINGS_MESSAGES } from "./settings/messages"
import { STAGE_MESSAGES } from "./stage/messages"
import { ASK_MESSAGES } from "./stand/messages"
import { TEXT_MESSAGES } from "./text/messages"
import { TOOL_PICKER_MESSAGES } from "./tool-picker/messages"
import { TOOL_SWITCH_MESSAGES } from "./tool-switch/messages"
import { TOOLBOX_MESSAGES } from "./toolbox/messages"
import { joinMessages } from "./utils/join-messages"
import { UTILS_MESSAGES } from "./utils/messages"
import { WIDE_SEARCH_MESSAGES } from "./wide-search/messages"
import { WINDOW_MESSAGES } from "./window/messages"
import { ZOOM_MESSAGES } from "./zoom/messages"

export const BASE_MESSAGES = joinMessages(
  STAGE_MESSAGES,
  WINDOW_MESSAGES,
  TOOL_SWITCH_MESSAGES,
  TOOL_PICKER_MESSAGES,
  MINIMAP_MESSAGES,
  ZOOM_MESSAGES,
  SEARCH_MESSAGES,
  TOOLBOX_MESSAGES,
  DIALOG_MESSAGES,
  MENU_MESSAGES,
  BOOK_LOOK_MESSAGES,
  BOOK_NEW_MESSAGES,
  LIBRARY_MESSAGES,
  PAGE_MESSAGES,
  LOCK_MESSAGES,
  PRINT_PREVIEW_MESSAGES,
  NOTE_MESSAGES,
  MARK_MESSAGES,
  RIGHT_SIDE_PANEL_MESSAGES,
  LEFT_SIDE_PANEL_MESSAGES,
  MAIL_MESSAGES,
  SCRAP_MESSAGES,
  WIDE_SEARCH_MESSAGES,
  PARTICIPANT_MESSAGES,
  MARKDOWN_DOCUMENT_MESSAGES,
  OUTBOX_MESSAGES,
  SETTINGS_MESSAGES,
  LOOKS_MESSAGES,
  ITEM_PARTS_MESSAGES,
  TEXT_MESSAGES,
  UTILS_MESSAGES,
  CORNER_MESSAGES,
  ASK_MESSAGES,
  HISTORY_MESSAGES,
  OPEN_GUIDE_MESSAGES,
)
