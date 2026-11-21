// カレントチケットになれるかの判定と、プロジェクトのレーンの作業中の印が変わったときのカレントワークの直し。
// プロジェクトのアクション（project-update）も使うので、チケットとカレントワークの定義を読まない（読むと、プロジェクトの定義へ戻る輪になる）
import { kit } from "../kit"
import { inWorkingLane, type Project } from "../project/project"
import type { TicketLike } from "../ticket/current"

// カレントワークの種類の id と、無いことを表す値（定義は work.ts。ここでは id だけを書く）
export const CURRENT_WORK_ID = kit.name("current-work")
export const NO_TICKET = "none"

// チケット ticket が、ワークルーム workroom のカレントチケットになれるか: 担当に入っていて、プロジェクトの作業中のレーンにある
export const isCurrentFor = (ticket: TicketLike, workroom: string, project: Project | undefined): boolean =>
  project !== undefined && ticket.assignees.includes(workroom) && inWorkingLane(project, ticket.lane)

// ワークルーム workroom のカレントワークを ticket（チケットの id か none）にする、others の 1 件
export const currentWorkSet = (workroom: string, ticket: string) => ({
  subject: CURRENT_WORK_ID,
  id: workroom,
  record: { id: workroom, ticket },
})

// プロジェクトが before から after に変わったとき（レーンの作業中の印を付けた・外した、レーンを消した）の、カレントワークの直し（others）。
// tickets はそのプロジェクトのチケット、works は読んだカレントワーク。チケットの変更と同じ決まり:
// - このプロジェクトのチケットを指すカレントワークのうち、カレントチケットでなくなった物を none にする
// - 新しくカレントチケットになれたワークルームで、カレントワークが none（になった物も含む）の物は、そのチケットにする（更新の新しい順で先の 1 枚）
export function currentWorkOnLanes(
  before: Project,
  after: Project,
  tickets: readonly (TicketLike & { id: string })[],
  works: readonly { id: string; ticket: string }[],
): ReturnType<typeof currentWorkSet>[] {
  const byId = new Map(tickets.map(t => [t.id, t]))
  const now = new Map(works.map(w => [w.id, w.ticket]))
  const changes = new Map<string, string>()
  for (const w of works) {
    const t = byId.get(w.ticket)
    if (t && !isCurrentFor(t, w.id, after)) {
      changes.set(w.id, NO_TICKET)
      now.set(w.id, NO_TICKET)
    }
  }
  const newest = [...tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.number - b.number)
  for (const t of newest)
    for (const room of t.assignees) {
      if (!isCurrentFor(t, room, after) || isCurrentFor(t, room, before)) continue
      if ((now.get(room) ?? NO_TICKET) !== NO_TICKET) continue
      changes.set(room, t.id)
      now.set(room, t.id)
    }
  return [...changes].flatMap(([room, ticket]) =>
    (works.find(w => w.id === room)?.ticket ?? NO_TICKET) === ticket ? [] : [currentWorkSet(room, ticket)],
  )
}
