// タスクボードのプラグイン: プロジェクト（タスクボード 1 枚）・チケット・チケット履歴・カレントワークの対象の定義と、履歴の題の列挙、そのアクションと認可ステップ（閉じたプロジェクトを守る）、プロジェクト設定のダイアログ。
import { defineBuiltin } from "../../plugin-api/builtin"
import { CARD_VISIT, LANE_SORTS, MAXIMIZED, PROJECT_ORDER, SHOWN_PROJECTS } from "./board"
import { TICKET_COMPLETE } from "./completion"
import { CURRENT_WORK, TICKET_LEAVE, TICKET_START } from "./current-work"
import { kit } from "./kit"
import { PROJECT, PROJECT_ADD, PROJECT_CLOSE, PROJECT_REOPEN, PROJECT_UPDATE } from "./project"
import { LIST_OPEN } from "./project-list"
import { PROJECT_SETTINGS_DIALOG } from "./project-settings"
import { CLOSED_PROJECT, TICKET, TICKET_ADD, TICKET_LOCK, TICKET_REMOVE, TICKET_UNLOCK, TICKET_UPDATE } from "./ticket"
import {
  HISTORY,
  HISTORY_TOPIC,
  TICKET_HISTORY_ADD,
  TOPIC_BODY,
  TOPIC_COMPLETE,
  TOPIC_PLAN,
  TOPIC_QUESTION,
  TOPIC_STATUS,
} from "./ticket-history"
import { TICKET_SCREEN, TICKET_SCREEN_STATE } from "./ticket-screen"
import { TICKET_FILTER } from "./wide-search"

export const TASKBOARD_PLUGIN = defineBuiltin(
  kit.plugin({
    subjects: [PROJECT, TICKET, HISTORY, CURRENT_WORK],
    enums: [HISTORY_TOPIC],
    enumValues: [TOPIC_STATUS, TOPIC_PLAN, TOPIC_QUESTION, TOPIC_BODY, TOPIC_COMPLETE],
    actions: [
      PROJECT_ADD,
      PROJECT_UPDATE,
      PROJECT_CLOSE,
      PROJECT_REOPEN,
      TICKET_ADD,
      TICKET_UPDATE,
      TICKET_REMOVE,
      TICKET_LOCK,
      TICKET_UNLOCK,
      TICKET_HISTORY_ADD,
      TICKET_COMPLETE,
      TICKET_START,
      TICKET_LEAVE,
    ],
    permissions: [CLOSED_PROJECT],
    dialogs: [PROJECT_SETTINGS_DIALOG],
    screens: [TICKET_SCREEN],
    userSettings: [PROJECT_ORDER, SHOWN_PROJECTS],
    pluginStates: [LIST_OPEN, LANE_SORTS, MAXIMIZED, CARD_VISIT, TICKET_SCREEN_STATE, TICKET_FILTER],
  }),
)

declare module "../../core/catalog" {
  interface SubjectTable {
    "@matomezu/taskboard:project": typeof PROJECT
    "@matomezu/taskboard:ticket": typeof TICKET
    "@matomezu/taskboard:ticket-history": typeof HISTORY
    "@matomezu/taskboard:current-work": typeof CURRENT_WORK
  }
  interface EnumTable {
    "@matomezu/taskboard:history-topic": typeof HISTORY_TOPIC
  }
  interface EnumValueTable {
    "@matomezu/taskboard:topic-status": typeof TOPIC_STATUS
    "@matomezu/taskboard:topic-plan": typeof TOPIC_PLAN
    "@matomezu/taskboard:topic-question": typeof TOPIC_QUESTION
    "@matomezu/taskboard:topic-body": typeof TOPIC_BODY
    "@matomezu/taskboard:topic-complete": typeof TOPIC_COMPLETE
  }
  interface ActionTable {
    "@matomezu/taskboard:project-add": typeof PROJECT_ADD
    "@matomezu/taskboard:project-update": typeof PROJECT_UPDATE
    "@matomezu/taskboard:project-close": typeof PROJECT_CLOSE
    "@matomezu/taskboard:project-reopen": typeof PROJECT_REOPEN
    "@matomezu/taskboard:ticket-add": typeof TICKET_ADD
    "@matomezu/taskboard:ticket-update": typeof TICKET_UPDATE
    "@matomezu/taskboard:ticket-remove": typeof TICKET_REMOVE
    "@matomezu/taskboard:ticket-lock": typeof TICKET_LOCK
    "@matomezu/taskboard:ticket-unlock": typeof TICKET_UNLOCK
    "@matomezu/taskboard:ticket-history-add": typeof TICKET_HISTORY_ADD
    "@matomezu/taskboard:ticket-complete": typeof TICKET_COMPLETE
    "@matomezu/taskboard:ticket-start": typeof TICKET_START
    "@matomezu/taskboard:ticket-leave": typeof TICKET_LEAVE
  }
  interface UserSettingTable {
    "@matomezu/taskboard:project-order": typeof PROJECT_ORDER
    "@matomezu/taskboard:shown-projects": typeof SHOWN_PROJECTS
  }
  interface PluginStateTable {
    "@matomezu/taskboard:list-open": typeof LIST_OPEN
    "@matomezu/taskboard:lane-sorts": typeof LANE_SORTS
    "@matomezu/taskboard:maximized": typeof MAXIMIZED
    "@matomezu/taskboard:card-visit": typeof CARD_VISIT
    "@matomezu/taskboard:ticket-screen-state": typeof TICKET_SCREEN_STATE
    "@matomezu/taskboard:ticket-filter": typeof TICKET_FILTER
  }
  interface ScreenTable {
    "@matomezu/taskboard:ticket-screen": typeof TICKET_SCREEN
  }
  interface PermissionTable {
    "@matomezu/taskboard:closed-project": typeof CLOSED_PROJECT
  }
  interface DialogTable {
    "@matomezu/taskboard:project-settings": typeof PROJECT_SETTINGS_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
