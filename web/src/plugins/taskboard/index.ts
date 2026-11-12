// タスクボードのプラグイン: プロジェクト（タスクボード 1 枚）・チケット・チケット履歴・ワークルームごとの今のチケットの対象の定義と、履歴の題の列挙、そのアクションと認可ステップ（閉じたプロジェクトにチケットを足させない）。
import { defineBuiltin } from "../../plugin-api/builtin"
import {
  CURRENT_TICKET_SET,
  PROJECT_ADD,
  PROJECT_CLOSE,
  PROJECT_REOPEN,
  PROJECT_UPDATE,
  TICKET_ADD,
  TICKET_HISTORY_ADD,
  TICKET_LOCK,
  TICKET_REMOVE,
  TICKET_UNLOCK,
  TICKET_UPDATE,
} from "./actions"
import { CURRENT } from "./current"
import { HISTORY, HISTORY_TOPIC, TOPIC_BODY, TOPIC_PLAN, TOPIC_QUESTION, TOPIC_STATUS } from "./history"
import { kit } from "./kit"
import { CLOSED_PROJECT } from "./permission"
import { PROJECT } from "./project"
import { TICKET } from "./ticket"
import { TICKET_SCREEN_STATE } from "./ticket-screen-state"

export const TASKBOARD_PLUGIN = defineBuiltin(
  kit.plugin({
    subjects: [PROJECT, TICKET, HISTORY, CURRENT],
    enums: [HISTORY_TOPIC],
    enumValues: [TOPIC_STATUS, TOPIC_PLAN, TOPIC_QUESTION, TOPIC_BODY],
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
      CURRENT_TICKET_SET,
    ],
    permissions: [CLOSED_PROJECT],
    pluginStates: [TICKET_SCREEN_STATE],
  }),
)

declare module "../../core/catalog" {
  interface SubjectTable {
    "@matomezu/taskboard:project": typeof PROJECT
    "@matomezu/taskboard:ticket": typeof TICKET
    "@matomezu/taskboard:ticket-history": typeof HISTORY
    "@matomezu/taskboard:current-ticket": typeof CURRENT
  }
  interface EnumTable {
    "@matomezu/taskboard:history-topic": typeof HISTORY_TOPIC
  }
  interface EnumValueTable {
    "@matomezu/taskboard:topic-status": typeof TOPIC_STATUS
    "@matomezu/taskboard:topic-plan": typeof TOPIC_PLAN
    "@matomezu/taskboard:topic-question": typeof TOPIC_QUESTION
    "@matomezu/taskboard:topic-body": typeof TOPIC_BODY
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
    "@matomezu/taskboard:current-ticket-set": typeof CURRENT_TICKET_SET
  }
  interface PluginStateTable {
    "@matomezu/taskboard:ticket-screen-state": typeof TICKET_SCREEN_STATE
  }
  interface PermissionTable {
    "@matomezu/taskboard:closed-project": typeof CLOSED_PROJECT
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
