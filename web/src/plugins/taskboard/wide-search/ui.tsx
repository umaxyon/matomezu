// 横断検索（タスクボード側）の見た目: 「チケット」のモードと、チケット・チケット履歴の横断検索の当たりの開き方
import { useRecords } from "../../../plugin-api/ui"
import { defineWideSearchMode, defineWideSearchOpener, type WideSearchHit, type WideSearchOpened } from "../../base/ui"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { ticketLabel } from "../ticket/label"
import { HISTORY } from "../ticket-history"
import { useOpenTicket } from "../ticket-screen/useOpenTicket"
import { TicketMode } from "./TicketMode"

export const TICKET_MODE = defineWideSearchMode({
  id: kit.name("wide-search-ticket"),
  title: kit.message("Tickets"),
  view: TicketMode,
})

// チケットスクリーンでチケットを開く関数を返すフック（当たった物がチケット履歴なら、その親のチケット）。開き方は useOpenTicket の hit
const useOpenHit = (ticketOf: (hit: WideSearchHit) => string | undefined) => {
  const opener = useOpenTicket()
  return (hit: WideSearchHit): WideSearchOpened => {
    const ticket = ticketOf(hit)
    return ticket === undefined ? "opened" : opener.hit(ticket)
  }
}

// 横断検索の当たりの名前: 当たったチケット（チケット履歴の当たりは親のチケット）の「番号の見せ方 名前」。画面の持つチケットとプロジェクトから作る（無ければホストの label）
const useTicketLabel = (ticketOf: (hit: WideSearchHit) => string | undefined) => {
  const tickets = useRecords(TICKET.id, { where: [] })
  const projects = useRecords(PROJECT.id, { where: [] })
  return (hit: WideSearchHit) => {
    const ticket = tickets.find(t => t.id === ticketOf(hit))
    if (ticket === undefined) return undefined
    const project = projects.find(p => p.id === ticket.project)
    return `${ticketLabel(project?.prefix ?? "", ticket.number)} ${ticket.name}`
  }
}

export const TICKET_OPENER = defineWideSearchOpener({
  id: kit.name("wide-search-open-ticket"),
  kind: TICKET.id,
  useOpen: () => useOpenHit(hit => hit.id),
  useLabel: () => useTicketLabel(hit => hit.id),
})

export const HISTORY_OPENER = defineWideSearchOpener({
  id: kit.name("wide-search-open-history"),
  kind: HISTORY.id,
  useOpen: () => useOpenHit(hit => hit.of?.id),
  useLabel: () => useTicketLabel(hit => hit.of?.id),
})
