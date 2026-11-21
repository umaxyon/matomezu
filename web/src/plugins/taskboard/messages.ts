// タスクボードの文言。フォルダごとの文言の表を 1 つにする
import { joinMessages } from "../base"
import { BOARD_MESSAGES } from "./board/messages"
import { COMPLETION_MESSAGES } from "./completion/messages"
import { CURRENT_TICKET_MESSAGES } from "./current-ticket/messages"
import { CURRENT_WORK_MESSAGES } from "./current-work/messages"
import { PROJECT_MESSAGES } from "./project/messages"
import { PROJECT_LIST_MESSAGES } from "./project-list/messages"
import { PROJECT_SETTINGS_MESSAGES } from "./project-settings/messages"
import { TICKET_MESSAGES } from "./ticket/messages"
import { TICKET_HISTORY_MESSAGES } from "./ticket-history/messages"
import { TICKET_SCREEN_MESSAGES } from "./ticket-screen/messages"
import { WIDE_SEARCH_MESSAGES } from "./wide-search/messages"

export const TASKBOARD_MESSAGES = joinMessages(
  COMPLETION_MESSAGES,
  PROJECT_MESSAGES,
  TICKET_MESSAGES,
  TICKET_HISTORY_MESSAGES,
  CURRENT_TICKET_MESSAGES,
  CURRENT_WORK_MESSAGES,
  BOARD_MESSAGES,
  PROJECT_LIST_MESSAGES,
  PROJECT_SETTINGS_MESSAGES,
  TICKET_SCREEN_MESSAGES,
  WIDE_SEARCH_MESSAGES,
)
