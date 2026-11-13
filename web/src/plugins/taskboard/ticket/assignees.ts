// チケットの担当のワークルーム（チケットの並びのまま。もう無いワークルームは外す）
import type { z } from "zod"
import type { TICKET } from "."

type Ticket = z.output<typeof TICKET.record>

export const assigneesOf = <W extends { id: string }>(ticket: Ticket, workrooms: readonly W[]): W[] =>
  ticket.assignees.flatMap(id => workrooms.find(w => w.id === id) ?? [])
