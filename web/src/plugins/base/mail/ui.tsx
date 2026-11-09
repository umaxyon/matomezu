// 郵便の見た目のウィジェット: 郵便箱（左サイドパネルの最初のタブ）、しおりと見張り（根に置く）、行き先の物のレイヤー（ブックのレイヤー）。郵便のダイアログ
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineLeftSidePanelTab, type PlaceInSlot, placeIn } from "../left-side-panel/ui"
import { BOOK_LAYERS } from "../workspace/slots"
import { MailBookmarks } from "./Bookmarks"
import { MAIL_DIALOG } from "./dialogs"
import { useUnreadMail } from "./hooks"
import { MailboxView } from "./Mailbox"
import { MailDialog } from "./MailDialog"
import { MailLayer } from "./MailLayer"
import { MailWatch } from "./MailWatch"
import { ProposalActions } from "./ProposalActions"
import { MAIL_PROPOSAL } from "./proposal"
import { MAIL_ACTIONS, type MailActionsProps } from "./slots"
import { MAILBOX_TAB_ID } from "./tab-id"

// 郵便の種類 mail（種類の本当の id）のダイアログの下の行のウィジェット（スロット mail-actions に置く）。
// 置いた種類のダイアログは、閉じるの横にこのウィジェットを描く（種類のボタンなどを置く。何も描かなければ、閉じるだけ）。
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
    mailActions: { mail: def.mail },
    view: def.view,
  })

// 郵便箱のタブ（開くボタンとタブに、まだ見ていない郵便の数を出す）
export const MAILBOX_TAB = defineLeftSidePanelTab({
  id: MAILBOX_TAB_ID,
  title: kit.message("Mailbox"),
  useCount: useUnreadMail,
  opens: [MAIL_ACTIONS],
  view: MailboxView,
})

export const MAIL_BOOKMARKS = defineWidget({ id: kit.name("mail-bookmarks"), slots: ["root"], view: MailBookmarks })

export const MAIL_WATCH = defineWidget({ id: kit.name("mail-watch"), slots: ["root"], view: MailWatch })

export const MAIL_DIALOG_VIEWS = { [MAIL_DIALOG.id]: MailDialog }

export const MAIL_LAYER = defineWidget({ id: kit.name("mail-layer"), slots: [BOOK_LAYERS], view: MailLayer })

// 変更提案郵便のダイアログの下の行（場所を示す・反映）
export const PROPOSAL_ACTIONS = defineMailActions({
  id: kit.name("proposal-actions"),
  mail: MAIL_PROPOSAL.id,
  view: ProposalActions,
})
