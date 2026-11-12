// タスクボードのプラグイン: プロジェクト（タスクボード 1 枚）とチケットの対象の定義と、そのアクション・認可ステップ（閉じたプロジェクトにチケットを足させない）。
import { defineBuiltin } from "../../plugin-api/builtin"
import {
  PROJECT_ADD,
  PROJECT_CLOSE,
  PROJECT_REOPEN,
  PROJECT_UPDATE,
  TICKET_ADD,
  TICKET_REMOVE,
  TICKET_UPDATE,
} from "./actions"
import { kit } from "./kit"
import { CLOSED_PROJECT } from "./permission"
import { PROJECT } from "./project"
import { TICKET } from "./ticket"

export const TASKBOARD_PLUGIN = defineBuiltin(
  kit.plugin({
    subjects: [PROJECT, TICKET],
    actions: [PROJECT_ADD, PROJECT_UPDATE, PROJECT_CLOSE, PROJECT_REOPEN, TICKET_ADD, TICKET_UPDATE, TICKET_REMOVE],
    permissions: [CLOSED_PROJECT],
  }),
)

declare module "../../core/catalog" {
  interface SubjectTable {
    "@matomezu/taskboard:project": typeof PROJECT
    "@matomezu/taskboard:ticket": typeof TICKET
  }
  interface ActionTable {
    "@matomezu/taskboard:project-add": typeof PROJECT_ADD
    "@matomezu/taskboard:project-update": typeof PROJECT_UPDATE
    "@matomezu/taskboard:project-close": typeof PROJECT_CLOSE
    "@matomezu/taskboard:project-reopen": typeof PROJECT_REOPEN
    "@matomezu/taskboard:ticket-add": typeof TICKET_ADD
    "@matomezu/taskboard:ticket-update": typeof TICKET_UPDATE
    "@matomezu/taskboard:ticket-remove": typeof TICKET_REMOVE
  }
  interface PermissionTable {
    "@matomezu/taskboard:closed-project": typeof CLOSED_PROJECT
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
