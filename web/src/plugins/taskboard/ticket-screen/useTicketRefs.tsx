// 文中のチケットの番号をリンクにするための、見つける関数と、押したときに開く関数（開いているチケット current 自身の番号は、押しても何もしない）。
// 今あるプロジェクトとチケットが変わると、見つける関数も替わる
import { useMemo } from "react"
import { useRecords } from "../../../plugin-api/ui"
import type { WordFinder } from "../../base"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { ticketRefFinder } from "../ticket/refs"
import { useOpenTicket } from "./useOpenTicket"

export function useTicketRefs(current: string): { find: WordFinder; open: (ticket: string) => void } {
  const tickets = useRecords(TICKET.id, { where: [] })
  const projects = useRecords(PROJECT.id, { where: [] })
  const find = useMemo(() => ticketRefFinder(projects, tickets), [projects, tickets])
  const openTicket = useOpenTicket()
  return { find, open: ticket => ticket !== current && openTicket(ticket) }
}
