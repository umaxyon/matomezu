// チケットスクリーンの画面の状態（窓の中だけの状態。画面の場所には入れない）: どのチケットの物か（ticket。開いているチケットが替われば初めに戻す）・本文の見せ方・本文を出しているか・
// 本文を最大化しているか・右に開いている質問（チケット履歴の行の id）
import type { MarkdownPaneMode } from "../../base"
import { kit } from "../kit"

export interface TicketScreenState {
  ticket: string
  mode: MarkdownPaneMode
  body: boolean
  maximized: boolean
  question?: string
}

export const TICKET_SCREEN_STATE = kit.definePluginStateOf<TicketScreenState>()({
  id: "ticket-screen-state",
  scope: "window",
})

// チケット ticket の画面の状態: 今の値がそのチケットの物でなければ、初めの形（本文はプレビューだけで出している）
export const viewOf = (now: TicketScreenState | undefined, ticket: string): TicketScreenState =>
  now?.ticket === ticket ? now : { ticket, mode: "rendered-only", body: true, maximized: false }
