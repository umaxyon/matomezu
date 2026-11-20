// チケットの担当のワークルーム（チケットの並びのまま。もう無いワークルームは外す）
import type { Ticket } from "./ticket"

export const assigneesOf = <W extends { id: string }>(ticket: Ticket, workrooms: readonly W[]): W[] =>
  ticket.assignees.flatMap(id => workrooms.find(w => w.id === id) ?? [])
