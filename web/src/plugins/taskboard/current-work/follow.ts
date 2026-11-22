// カレントワークのフォローステップ: チケットとプロジェクトが変わったら、それを指すカレントワークを同じトランザクションで直す
// （どのアクションがチケットやプロジェクトを変えても、同じ決まりで直す）
import type { FollowStepDef } from "../../../plugin-api"
import { PROJECT, type Project } from "../project"
import { TICKET, type Ticket } from "../ticket/ticket"
import { CURRENT_WORK, currentWorkChanges, currentWorkOnLanes, currentWorksOf, READS_CURRENT_WORK } from "./work"

// チケットが変わったら（作った・変えた・消した）: そのチケットを指すカレントワークのうちカレントチケットでなくなった物を none に、
// 新しくカレントチケットになれたワークルームで、カレントワークが none の物をこのチケットにする。
// ロックの掛け外し（locked だけの変わり）には応じない（ロックのアクションは locked のほかを変えない）
export const FOLLOW_TICKETS: FollowStepDef<typeof TICKET.id> = {
  watches: TICKET.id,
  writes: [CURRENT_WORK.id],
  reads: change => {
    if (lockOnly(change.before, change.after)) return []
    const ticket = change.after === "removed" ? change.before : change.after
    return [READS_CURRENT_WORK, ...(ticket === "none" ? [] : [{ subject: PROJECT.id, id: ticket.project }])]
  },
  follow: (change, ctx) => {
    if (lockOnly(change.before, change.after)) return []
    const ticket = change.after === "removed" ? change.before : change.after
    const project = ticket === "none" ? undefined : (ctx.records[PROJECT.id]?.[ticket.project] as Project | undefined)
    return currentWorkChanges(
      change.before as Ticket | "none",
      change.after as Ticket | "removed",
      project,
      currentWorksOf(ctx),
    )
  },
}

// プロジェクトのレーンが変わったら（作業中の印を付けた・外した、レーンを消した）: 同じ決まりで、そのプロジェクトのチケットを指すカレントワークを直す
export const FOLLOW_PROJECT_LANES: FollowStepDef<typeof PROJECT.id> = {
  watches: PROJECT.id,
  writes: [CURRENT_WORK.id],
  reads: change =>
    lanesChanged(change.before, change.after)
      ? [{ subject: TICKET.id, where: [{ key: "project", eq: change.id }] }, READS_CURRENT_WORK]
      : [],
  follow: (change, ctx) => {
    const { before, after } = change
    if (before === "none" || after === "removed" || !lanesChanged(before, after)) return []
    const tickets = Object.values(ctx.records[TICKET.id] ?? {}) as Ticket[]
    return currentWorkOnLanes(before, after, tickets, currentWorksOf(ctx))
  },
}

const lanesChanged = (before: Project | "none", after: Project | "removed"): boolean =>
  before !== "none" && after !== "removed" && JSON.stringify(before.lanes) !== JSON.stringify(after.lanes)

// チケットの変わりが、ロックの掛け外しだけか
function lockOnly(before: Ticket | "none", after: Ticket | "removed"): boolean {
  if (before === "none" || after === "removed") return false
  const { locked: _b, ...was } = before
  const { locked: _a, ...now } = after
  return JSON.stringify(was) === JSON.stringify(now)
}
