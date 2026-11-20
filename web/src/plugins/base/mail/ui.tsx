// 郵便の見た目のウィジェット: 郵便箱（左サイドパネルのタブ）と、それを開くボタン、しおりと見張り（根に置く）、行き先の物のレイヤー（ブックのレイヤー）。郵便のダイアログ
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { LeftSidePanelOpenButton } from "../left-side-panel/OpenButton"
import { defineLeftSidePanelTab, opensOf } from "../left-side-panel/ui"
import { OUTBOX } from "../outbox/ui"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { BOOK_LAYERS } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import { MailBookmarks } from "./Bookmarks"
import { MAIL_DIALOG } from "./dialogs"
import { mailboxEntries } from "./entries"
import { useUnreadMail } from "./hooks"
import { JoinRequestActions } from "./JoinRequestActions"
import { MAIL_JOIN_REQUEST } from "./join-request"
import { MailboxView } from "./Mailbox"
import { MailDialog } from "./MailDialog"
import { MailLayer } from "./MailLayer"
import { MailWatch } from "./MailWatch"
import { ProposalActions } from "./ProposalActions"
import { MAIL_PROPOSAL } from "./proposal"
import { MAIL_ACTIONS, type MailActionsProps } from "./slots"
import { MAILBOX_TAB_ID } from "./tab-id"

// 郵便の種類 mail（種類の本当の id）のダイアログの下の行のウィジェット（スロット mail-actions に置く）。
// 置いた種類のダイアログは、閉じるの横にこのウィジェットを描く（種類のボタンなどを置く。何も描かなければ、閉じるだけ）。mail の持ち主のプラグインだけが名乗れる（ウィジェットの forKind に入れ、台帳アセンブルが確かめる。違えば E312 の error）。
// place は、追加プラグインが既定の UI マッピングに足してほしいとき（true なら末尾）
export const defineMailActions = <const Id extends string>(def: {
  id: Id
  mail: string
  place?: PlaceInSlot
  view: (props: MailActionsProps) => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [MAIL_ACTIONS],
    ...(def.place ? { place: placeIn(MAIL_ACTIONS, def.place) } : {}),
    forKind: def.mail,
    view: def.view,
  })

// 郵便箱のタブ（開くボタンとタブに、まだ見ていない郵便の数を出す）
export const MAILBOX_TAB = defineLeftSidePanelTab<typeof MAILBOX_TAB_ID>({
  id: MAILBOX_TAB_ID,
  title: kit.message("Mailbox"),
  useCount: useUnreadMail,
  opens: [MAIL_ACTIONS],
  view: MailboxView,
})

// 郵便箱を開く側（郵便箱のボタンとしおり）が、左サイドパネルに渡すタブ（郵便箱と送信トレイ）の opens を名乗る
export const MAILBOX_OPENS = opensOf(MAILBOX_TAB, OUTBOX)

export const MAIL_BOOKMARKS = defineWidget({
  id: kit.name("mail-bookmarks"),
  slots: ["root"],
  opens: MAILBOX_OPENS,
  view: MailBookmarks,
})

export const MAIL_WATCH = defineWidget({ id: kit.name("mail-watch"), slots: ["root"], view: MailWatch })

export const MAIL_DIALOG_VIEWS = { [MAIL_DIALOG.id]: MailDialog }

export const MAIL_LAYER = defineWidget({ id: kit.name("mail-layer"), slots: [BOOK_LAYERS], view: MailLayer })

// 変更提案郵便のダイアログの下の行（場所を示す・反映）
export const PROPOSAL_ACTIONS = defineMailActions({
  id: kit.name("proposal-actions"),
  mail: MAIL_PROPOSAL.id,
  view: ProposalActions,
})

// 参加要求の郵便のダイアログの下の行（断る・受け入れる）
export const JOIN_REQUEST_ACTIONS = defineMailActions({
  id: kit.name("join-request-actions"),
  mail: MAIL_JOIN_REQUEST.id,
  view: JoinRequestActions,
})

// 郵便箱を開くボタン（フッタメニューに置く）: 郵便箱と、このステージの送信トレイを渡して左サイドパネルを開く
export const MAILBOX_BUTTON = defineWidget({
  id: kit.name("mailbox-button"),
  slots: STAGE_SLOTS,
  opens: MAILBOX_OPENS,
  view: MailboxButton,
})

// 郵便箱を開くボタン（開く送信トレイは、描いている場所のステージの物）
function MailboxButton() {
  return <LeftSidePanelOpenButton entries={mailboxEntries} />
}

export { useMailboxPanel } from "./hooks"
export { MAIL_ACTIONS, type MailActionsProps } from "./slots"
