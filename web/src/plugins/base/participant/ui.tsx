// 参加者の見た目: 受け入れのダイアログ、ようこそのダイアログ、参加要求の郵便のダイアログの下の行
import { kit } from "../kit"
import { MAIL_JOIN_REQUEST } from "../mail/join-request"
import { defineMailActions } from "../mail/ui"
import { PARTICIPANT_JOIN_DIALOG, PARTICIPANT_WELCOME_DIALOG } from "./dialogs"
import { ParticipantJoinDialog } from "./JoinDialog"
import { JoinRequestActions } from "./JoinRequestActions"
import { ParticipantWelcomeDialog } from "./WelcomeDialog"

export const PARTICIPANT_DIALOG_VIEWS = {
  [PARTICIPANT_JOIN_DIALOG.id]: ParticipantJoinDialog,
  [PARTICIPANT_WELCOME_DIALOG.id]: ParticipantWelcomeDialog,
}

export const JOIN_REQUEST_ACTIONS = defineMailActions({
  id: kit.name("join-request-actions"),
  mail: MAIL_JOIN_REQUEST.id,
  view: JoinRequestActions,
})
