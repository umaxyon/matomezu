// チケットスクリーンの見せ方（窓の中だけの状態。画面の場所には入れない）: どのチケットの物か（ticket。開いているチケットが替われば初めに戻す）・本文の見せ方・本文を出しているか・
// 本文を最大化しているか・右に開いている質問（履歴の行の id）
import type { MarkdownPaneMode } from "../base"
import { kit } from "./kit"

export interface TicketScreenView {
  ticket: string
  mode: MarkdownPaneMode
  body: boolean
  maximized: boolean
  question?: string
}

export const TICKET_SCREEN_VIEW = kit.definePluginStateOf<TicketScreenView>()({
  id: "ticket-screen-view",
  scope: "window",
})

// チケット ticket の見せ方: 今の値がそのチケットの物でなければ、初めの形（本文はプレビューだけで出している）
export const viewOf = (now: TicketScreenView | undefined, ticket: string): TicketScreenView =>
  now?.ticket === ticket ? now : { ticket, mode: "rendered-only", body: true, maximized: false }
