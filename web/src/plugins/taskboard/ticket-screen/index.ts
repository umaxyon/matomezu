// チケットスクリーンの定義と、その画面の状態（開いたスクリーン 1 枚ごとの状態。閉じると消える。画面の場所には入れない）: どのチケットの物か（ticket。開いているチケットが替われば初めに戻す）・本文の見せ方・右に出しているナレッジ（本文かワーカーブックのページの一覧か）・
// 本文を最大化しているか・右に開いている質問（チケット履歴の行の id）
import { NO_STATE } from "../../../plugin-api"
import type { MarkdownPaneMode } from "../../base"
import { kit } from "../kit"
import { TICKET_SCREEN_PROPS } from "./props"

// チケットスクリーン: チケット 1 枚を見て直すスクリーン。開くときに渡す値は、チケットの id
export const TICKET_SCREEN = kit.defineScreen({
  id: "ticket-screen",
  title: "ticket screen",
  aiDescription:
    "The screen of one ticket: its number, name, tag, assignees, priority, the lines of its history and its body. ticket is the ticket's id.",
  props: TICKET_SCREEN_PROPS,
})

export interface TicketScreenState {
  ticket: string
  mode: MarkdownPaneMode
  side: KnowledgeSide
  maximized: boolean
  question?: string
}

// 右に出しているナレッジ: 本文か、ワーカーブックのページの一覧（画面の文言は「作業ブック」）。いつもどちらか片方を出し、押すと入れ替わる
export type KnowledgeSide = "body" | "work-book"

export const TICKET_SCREEN_STATE = kit.definePluginStateOf<TicketScreenState>()({
  id: "ticket-screen-state",
  scope: "screen",
})

// チケット ticket の画面の状態: 今の値がそのチケットの物でなければ、初めの形（本文はプレビューだけで出している）
export const viewOf = (now: TicketScreenState | typeof NO_STATE, ticket: string): TicketScreenState =>
  now !== NO_STATE && now.ticket === ticket ? now : { ticket, mode: "rendered-only", side: "body", maximized: false }
