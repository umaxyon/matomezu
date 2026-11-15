// 郵便箱を開く側（ブックスクリーンの郵便箱のボタン・しおり）が左サイドパネルに渡すタブの組: 郵便箱と、送信トレイ（ステージ stage の物を見せる）
import type { LeftSidePanelEntry } from "../left-side-panel/state"
import { OUTBOX_TAB_ID } from "../outbox/tab-id"
import { MAILBOX_TAB_ID } from "./tab-id"

export const mailboxEntries = (stage: string): readonly LeftSidePanelEntry[] => [
  { tab: MAILBOX_TAB_ID, props: {} },
  { tab: OUTBOX_TAB_ID, props: {}, stage },
]
