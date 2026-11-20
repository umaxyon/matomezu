// ワークルームの今のチケット（更新の新しい順）を、持っているチケットとプロジェクトから引く。判定は ticket の currentTicketsOf
import { useMemo } from "react"
import { useRecords } from "../../../plugin-api/ui"
import type { TicketRecord } from "../board/shown"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { type CurrentTicket, currentTicketsOf } from "../ticket/current"

export function useCurrentTickets(workroom: string): readonly CurrentTicket<TicketRecord>[] {
  const tickets = useRecords(TICKET.id, { where: [{ key: "assigned", gt: 0 }] })
  const projects = useRecords(PROJECT.id, { where: [] })
  return useMemo(
    () => currentTicketsOf(workroom, tickets, id => projects.find(p => p.id === id)),
    [workroom, tickets, projects],
  )
}
