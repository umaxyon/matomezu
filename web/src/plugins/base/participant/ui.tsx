// 参加者の見た目: 受け入れのダイアログ、ようこそのダイアログ（参加要求の郵便のダイアログの下の行は、郵便の種類の持ち主の mail/ui.tsx）
import { PARTICIPANT_JOIN_DIALOG, PARTICIPANT_WELCOME_DIALOG } from "./dialogs"
import { ParticipantJoinDialog } from "./JoinDialog"
import { ParticipantWelcomeDialog } from "./WelcomeDialog"

export const PARTICIPANT_DIALOG_VIEWS = {
  [PARTICIPANT_JOIN_DIALOG.id]: ParticipantJoinDialog,
  [PARTICIPANT_WELCOME_DIALOG.id]: ParticipantWelcomeDialog,
}

export { BirdFaceView } from "./BirdFaceView"
export { useVisitorRows, useWorkroomActions, useWorkroomRows, type WorkroomActions } from "./hooks"
export { VisitorIcon } from "./VisitorIcon"
