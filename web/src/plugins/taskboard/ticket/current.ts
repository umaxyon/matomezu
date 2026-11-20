// ワークルームの今のチケット: そのワークルームが主担当（担当の並びの 1 人目）で、プロジェクトの作業中の印のあるレーンにあるチケット（記録は持たず、担当とレーンから決める）。
// 主担当は書いたままの assignees[0]（消したワークルームが先頭でも、そのワークルームの物として数える。索引キー lead と同じ決まり。消したワークルームは参加者の一覧に出ない）。
// 閉じたプロジェクトのチケットも数える。完了のレーンには作業中の印が付かないので、完了のチケットは入らない。
// 参加者の一覧の行の下の 1 行・右の今のタスクの列・作業の様子（workroomActivity）が、この 1 つの判定を使う
import type { z } from "zod"
import { inWorkingLane, type PROJECT } from "../project"

// 判定に使うチケットの項目（チケットのレコードの型は ticket の定義が、この判定を使うので、ここでは項目だけを書く）
export interface TicketLike {
  project: string
  number: number
  lane: string
  assignees: readonly string[]
  updatedAt: string
}
type Project = z.output<typeof PROJECT.record>

export interface CurrentTicket<T extends TicketLike = TicketLike> {
  ticket: T
  project: Project
}

// チケットの主担当のワークルームの id（担当がいなければ undefined）
export const leadOf = (ticket: { assignees: readonly string[] }): string | undefined => ticket.assignees[0]

// ワークルーム workroom の今のチケット（更新の新しい順。同じ時刻なら番号の順）。tickets はほかのワークルームのチケットが混ざってよい。projectOf はプロジェクトを id で引く
export function currentTicketsOf<T extends TicketLike>(
  workroom: string,
  tickets: readonly T[],
  projectOf: (id: string) => Project | undefined,
): CurrentTicket<T>[] {
  return tickets
    .flatMap(ticket => {
      if (leadOf(ticket) !== workroom) return []
      const project = projectOf(ticket.project)
      return project && inWorkingLane(project, ticket.lane) ? [{ ticket, project }] : []
    })
    .sort(
      (a, b) =>
        b.ticket.updatedAt.localeCompare(a.ticket.updatedAt) ||
        a.ticket.project.localeCompare(b.ticket.project) ||
        a.ticket.number - b.ticket.number,
    )
}
