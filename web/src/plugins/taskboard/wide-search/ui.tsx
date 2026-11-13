// 横断検索（タスクボード側）の見た目: 「チケット」のモードと、チケット・チケット履歴の横断検索の当たりの開き方
import { useRecords, useScreens } from "../../../plugin-api/ui"
import { defineWideSearchMode, defineWideSearchOpener, type WideSearchHit } from "../../base/ui"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { ticketLabel } from "../ticket/label"
import { HISTORY } from "../ticket-history"
import { TICKET_SCREEN } from "../ticket-screen"
import { TicketMode } from "./TicketMode"

export const TICKET_MODE = defineWideSearchMode({
  id: kit.name("wide-search-ticket"),
  title: kit.message("Tickets"),
  view: TicketMode,
})

// チケットスクリーンでチケット ticket を開く関数を返すフック（当たった物がチケット履歴なら、その親のチケット）
const useOpenTicket = (ticketOf: (hit: WideSearchHit) => string | undefined) => {
  const { open } = useScreens()
  return (hit: WideSearchHit) => {
    const ticket = ticketOf(hit)
    if (ticket !== undefined) open(TICKET_SCREEN, { ticket })
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
  useOpen: () => useOpenTicket(hit => hit.id),
  useLabel: () => useTicketLabel(hit => hit.id),
})

export const HISTORY_OPENER = defineWideSearchOpener({
  id: kit.name("wide-search-open-history"),
  kind: HISTORY.id,
  useOpen: () => useOpenTicket(hit => hit.of?.id),
  useLabel: () => useTicketLabel(hit => hit.of?.id),
})
