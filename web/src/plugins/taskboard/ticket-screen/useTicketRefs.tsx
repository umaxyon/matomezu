// 文中のチケットの番号をリンクにするための、見つける関数と、押したときに開き方を聞く関数（押したリンクの要素も受け取る。開いているチケット current 自身の番号は、押しても何もしない）。
// 今あるプロジェクトとチケットが変わると、見つける関数も替わる
import { useMemo } from "react"
import { useRecords } from "../../../plugin-api/ui"
import type { WordFinder } from "../../base"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { ticketRefFinder } from "../ticket/refs"
import { useAskOpen } from "./OpenChoice"

export function useTicketRefs(current: string): { find: WordFinder; open: (ticket: string, from: Element) => void } {
  const tickets = useRecords(TICKET.id, { where: [] })
  const projects = useRecords(PROJECT.id, { where: [] })
  const find = useMemo(() => ticketRefFinder(projects, tickets), [projects, tickets])
  const ask = useAskOpen()
  return { find, open: (ticket, from) => ticket !== current && ask(ticket, from) }
}
