// ワークルームのカレントチケット（判定は current-work の currentTicketOf）と、担当に入っているがカレントチケットでないチケット（担当に入っていて完了していない、カレントチケットでない物。更新の新しい順）
import { useMemo } from "react"
import { useRecord, useRecords } from "../../../plugin-api/ui"
import { CURRENT_WORK, currentTicketOf, isCurrentFor } from "../current-work"
import { inDoneLane, PROJECT } from "../project"
import type { Ticket } from "../ticket"
import { TICKET } from "../ticket"
import type { CurrentTicket } from "../ticket/current"

export interface WorkroomTickets {
  current: CurrentTicket<Ticket> | undefined
  assigned: readonly CurrentTicket<Ticket>[]
}

export function useCurrentTickets(workroom: string): WorkroomTickets {
  const work = useRecord(CURRENT_WORK.id, workroom)
  const tickets = useRecords(TICKET.id, { where: [{ key: "assigned", gt: 0 }] })
  const projects = useRecords(PROJECT.id, { where: [] })
  return useMemo(() => {
    const projectOf = (id: string) => projects.find(p => p.id === id)
    const current = currentTicketOf(workroom, work, id => tickets.find(t => t.id === id), projectOf)
    const assigned = tickets
      .flatMap(ticket => {
        const project = projectOf(ticket.project)
        if (!project || !ticket.assignees.includes(workroom) || inDoneLane(project, ticket.lane)) return []
        return ticket.id === current?.ticket.id ? [] : [{ ticket, project }]
      })
      .sort((a, b) => b.ticket.updatedAt.localeCompare(a.ticket.updatedAt) || a.ticket.number - b.ticket.number)
    return { current, assigned }
  }, [workroom, work, tickets, projects])
}

// チケット ticket をカレントチケットにしているワークルームの id（チケットカードの鳥をはっきり出す物）
export function useWorkingOn(ticket: Ticket): ReadonlySet<string> {
  const works = useRecords(CURRENT_WORK.id, { where: [{ key: "ticket", eq: ticket.id }] })
  const project = useRecord(PROJECT.id, ticket.project)
  return useMemo(
    () => new Set(works.filter(w => isCurrentFor(ticket, w.id, project)).map(w => w.id)),
    [works, ticket, project],
  )
}
