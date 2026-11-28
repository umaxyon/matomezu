// 参加者の見た目: 参加要求のしおり（スロット bookmarks に置く）と見張り（根に置く）、参加要求のダイアログ、受け入れのダイアログ、ようこそのダイアログ、
// 承認待ちの AI 間メッセージの吹き出し（参加者リストが置く）と確認のダイアログ
import { defineWidget } from "../../../ui/layout"
import { defineBookmarks } from "../bookmarks/ui"
import { kit } from "../kit"
import {
  JOIN_REQUEST_DIALOG,
  PARTICIPANT_JOIN_DIALOG,
  PARTICIPANT_WELCOME_DIALOG,
  PENDING_MESSAGE_DIALOG,
} from "./dialogs"
import { ParticipantJoinDialog } from "./JoinDialog"
import { JoinRequestBookmarks } from "./JoinRequestBookmarks"
import { JoinRequestDialog } from "./JoinRequestDialog"
import { JoinRequestWatch } from "./JoinRequestWatch"
import { PendingMessageDialog } from "./PendingMessageDialog"
import { ParticipantWelcomeDialog } from "./WelcomeDialog"

export { WORKER_BIRDS } from "./WorkerBirds"

export const JOIN_REQUEST_BOOKMARKS = defineBookmarks({
  id: kit.name("join-request-bookmarks"),
  view: JoinRequestBookmarks,
})

export const JOIN_REQUEST_WATCH = defineWidget({
  id: kit.name("join-request-watch"),
  slots: ["root"],
  view: JoinRequestWatch,
})

export const PARTICIPANT_DIALOG_VIEWS = {
  [JOIN_REQUEST_DIALOG.id]: JoinRequestDialog,
  [PARTICIPANT_JOIN_DIALOG.id]: ParticipantJoinDialog,
  [PARTICIPANT_WELCOME_DIALOG.id]: ParticipantWelcomeDialog,
  [PENDING_MESSAGE_DIALOG.id]: PendingMessageDialog,
}

export { AdminCrown, CrownIcon } from "./AdminCrown"
export { BirdFaceView } from "./BirdFaceView"
export {
  useAliveNow,
  useContextGauge,
  useOwnBookPages,
  useVisitorRows,
  useWorkerBook,
  useWorkroomActions,
  useWorkroomRows,
  useWorkroomWorkerBook,
  type WorkroomActions,
} from "./hooks"
export { PendingBalloon } from "./PendingBalloon"
export { VisitorIcon } from "./VisitorIcon"
export { WorkerBookPages } from "./WorkerBookPages"
