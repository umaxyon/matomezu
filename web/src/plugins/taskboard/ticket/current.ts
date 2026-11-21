// カレントチケットの判定（current-work の isCurrentFor・currentTicketOf）が使う、チケットの項目と、主担当
import type { Project } from "../project"

// 判定に使うチケットの項目（チケットのレコードの型は ticket の定義が、この判定を使うので、ここでは項目だけを書く）
export interface TicketLike {
  project: string
  number: number
  lane: string
  assignees: readonly string[]
  updatedAt: string
}

export interface CurrentTicket<T extends TicketLike = TicketLike> {
  ticket: T
  project: Project
}

// チケットの主担当のワークルームの id（担当がいなければ undefined）
export const leadOf = (ticket: { assignees: readonly string[] }): string | undefined => ticket.assignees[0]
