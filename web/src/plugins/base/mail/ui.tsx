// 郵便の見た目のウィジェット: 郵便箱のスクリーンと、それを開くフッタのボタン、しおり（スロット bookmarks に置く）と見張り（根に置く）、行き先の物のレイヤー（ブックのレイヤー）、郵便の種類の下の行（スロット mail-actions）
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { defineBookmarks } from "../bookmarks/ui"
import { kit } from "../kit"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { BOOK_LAYERS } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import { MailBookmarks } from "./Bookmarks"
import { MailboxButton } from "./MailboxButton"
import { MailLayer } from "./MailLayer"
import { MailWatch } from "./MailWatch"
import { ProposalActions } from "./ProposalActions"
import { MAIL_PROPOSAL } from "./proposal"
import { MAIL_ACTIONS, type MailActionsProps } from "./slots"

// 郵便の種類 mail（種類の本当の id）の、郵便箱の画面で選んだ郵便の下の行のウィジェット（スロット mail-actions に置く）。
// 置いた種類の郵便は、行き先のボタンの代わりにこのウィジェットを描く（種類のボタンなどを置く。行き先を開くのは渡された showPlace）。mail の持ち主のプラグインだけが名乗れる（ウィジェットの forKind に入れ、台帳アセンブルが確かめる。違えば E312 の error）。
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

export const MAIL_BOOKMARKS = defineBookmarks({
  id: kit.name("mail-bookmarks"),
  view: MailBookmarks,
})

export const MAIL_WATCH = defineWidget({ id: kit.name("mail-watch"), slots: ["root"], view: MailWatch })

export const MAIL_LAYER = defineWidget({ id: kit.name("mail-layer"), slots: [BOOK_LAYERS], view: MailLayer })

// 変更提案郵便の、郵便箱の画面の下の行（場所を示す・反映）
export const PROPOSAL_ACTIONS = defineMailActions({
  id: kit.name("proposal-actions"),
  mail: MAIL_PROPOSAL.id,
  view: ProposalActions,
})

// 郵便箱のボタン（フッタメニューに置く封筒）: 郵便箱のスクリーンを開け閉めする
export const MAILBOX_BUTTON = defineWidget({
  id: kit.name("mailbox-button"),
  slots: STAGE_SLOTS,
  view: MailboxButton,
})

export { useMailboxScreen } from "./hooks"
export { MailboxPane } from "./MailboxPane"
export { MAILBOX_SCREEN_VIEW } from "./screen-ui"
export { MAIL_ACTIONS, type MailActionsProps } from "./slots"
