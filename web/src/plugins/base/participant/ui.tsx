// 参加者の見た目: 受け入れのダイアログ、参加要求の郵便のダイアログの下の行
import { kit } from "../kit"
import { MAIL_JOIN_REQUEST } from "../mail/join-request"
import { defineMailActions } from "../mail/ui"
import { PARTICIPANT_JOIN_DIALOG } from "./dialogs"
import { ParticipantJoinDialog } from "./JoinDialog"
import { JoinRequestActions } from "./JoinRequestActions"

export const PARTICIPANT_DIALOG_VIEWS = { [PARTICIPANT_JOIN_DIALOG.id]: ParticipantJoinDialog }

export const JOIN_REQUEST_ACTIONS = defineMailActions({
  id: kit.name("join-request-actions"),
  mail: MAIL_JOIN_REQUEST.id,
  view: JoinRequestActions,
})
