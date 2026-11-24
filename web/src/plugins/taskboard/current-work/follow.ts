// カレントワークのフォローステップ: チケットとプロジェクトが変わったら、それを指すカレントワークを同じトランザクションで直す
// （どのアクションがチケットやプロジェクトを変えても、同じ決まりで直す）
import type { FollowStepDef } from "../../../plugin-api"
import { PROJECT, type Project } from "../project"
import { TICKET, type Ticket } from "../ticket/ticket"
import {
  CURRENT_WORK,
  currentWorkChanges,
  currentWorkOnLanes,
  currentWorksOf,
  openTicketsIn,
  READS_ASSIGNED_TICKETS,
  READS_CURRENT_WORK,
  READS_PROJECTS,
} from "./work"

// チケットが変わったら（作った・変えた・消した）: そのチケットを指すカレントワークのうちカレントチケットでなくなった物を選び直し
// （担当で作業中のレーンにあるほかのチケットが 1 枚ならそれ、ほかは none。選び直し得る変わりのときだけ、担当のいるチケットと全部のプロジェクトを読む）、
// 新しくカレントチケットになれたワークルームで、カレントワークが none の物をこのチケットにする。
// ロックの掛け外し（locked だけの変わり）には応じない（ロックのアクションは locked のほかを変えない）
export const FOLLOW_TICKETS: FollowStepDef<typeof TICKET.id> = {
  watches: TICKET.id,
  writes: [CURRENT_WORK.id],
  reads: change => {
    if (lockOnly(change.before, change.after)) return []
    const ticket = change.after === "removed" ? change.before : change.after
    if (mayLeave(change.before, change.after)) return [READS_CURRENT_WORK, READS_ASSIGNED_TICKETS, READS_PROJECTS]
    return [READS_CURRENT_WORK, ...(ticket === "none" ? [] : [{ subject: PROJECT.id, id: ticket.project }])]
  },
  follow: (change, ctx) => {
    if (lockOnly(change.before, change.after)) return {}
    const ticket = change.after === "removed" ? change.before : change.after
    const project = ticket === "none" ? undefined : (ctx.records[PROJECT.id]?.[ticket.project] as Project | undefined)
    return {
      records: currentWorkChanges(
        change.before as Ticket | "none",
        change.after as Ticket | "removed",
        project,
        currentWorksOf(ctx),
        mayLeave(change.before, change.after) ? openTicketsIn(ctx.records) : undefined,
      ),
    }
  },
}

// プロジェクトのレーンが変わったら（作業中の印を付けた・外した、レーンを消した）: 同じ決まりで、そのプロジェクトのチケットを指すカレントワークと、
// そのプロジェクトのチケットが新しくカレントチケットになれたワークルームのカレントワークを選び直す
export const FOLLOW_PROJECT_LANES: FollowStepDef<typeof PROJECT.id> = {
  watches: PROJECT.id,
  writes: [CURRENT_WORK.id],
  reads: change =>
    lanesChanged(change.before, change.after)
      ? [
          { subject: TICKET.id, where: [{ key: "project", eq: change.id }] },
          READS_CURRENT_WORK,
          READS_ASSIGNED_TICKETS,
          READS_PROJECTS,
        ]
      : [],
  follow: (change, ctx) => {
    const { before, after } = change
    if (before === "none" || after === "removed" || !lanesChanged(before, after)) return {}
    const tickets = (Object.values(ctx.records[TICKET.id] ?? {}) as Ticket[]).filter(t => t.project === change.id)
    return { records: currentWorkOnLanes(before, after, tickets, currentWorksOf(ctx), openTicketsIn(ctx.records)) }
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

// チケットの変わりで、それを指すカレントワークのカレントチケットでなくなり得るか（消した・レーンが変わった・担当から外れた）
function mayLeave(before: Ticket | "none", after: Ticket | "removed"): boolean {
  if (before === "none") return false
  if (after === "removed") return true
  return before.lane !== after.lane || before.assignees.some(w => !after.assignees.includes(w))
}
