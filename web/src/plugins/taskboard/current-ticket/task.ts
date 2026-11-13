// ワークルームの今のチケットを、レコードから決める（見た目でない）
import type { z } from "zod"
import type { ProjectRecord, TicketRecord } from "../board/shown"
import type { HistoryRecord } from "../ticket-history"
import { newestFirst } from "../ticket-history"
import { type CURRENT, NO_TICKET } from "."

export type CurrentRecord = z.output<typeof CURRENT.record>

// ワークルームの今のチケット（宣言が無い・none・チケットかプロジェクトが無ければ undefined）と、そのチケットの最新のチケット履歴
export interface CurrentTask {
  ticket: TicketRecord
  project: ProjectRecord
  latest: HistoryRecord | undefined
}

export function currentTaskOf(
  workroom: string,
  currents: readonly CurrentRecord[],
  tickets: readonly TicketRecord[],
  projects: readonly ProjectRecord[],
  entries: readonly HistoryRecord[],
): CurrentTask | undefined {
  const current = currents.find(c => c.id === workroom)
  if (!current || current.ticket === NO_TICKET) return undefined
  const ticket = tickets.find(t => t.id === current.ticket)
  const project = ticket && projects.find(p => p.id === ticket.project)
  if (!ticket || !project) return undefined
  return { ticket, project, latest: newestFirst(entries.filter(h => h.ticket === ticket.id))[0] }
}
