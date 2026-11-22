// カレントワークのフォローステップ: チケットとプロジェクトが変わったら、それを指すカレントワークを同じトランザクションで直す
// （どのアクションがチケットやプロジェクトを変えても、同じ決まりで直す）
import type { FollowStepDef } from "../../../plugin-api"
import { PROJECT, type Project } from "../project"
import { TICKET, type Ticket } from "../ticket/ticket"
import { CURRENT_WORK, currentWorkChanges, currentWorkOnLanes, READS_CURRENT_WORK } from "./work"

// 読んだカレントワークとチケット（形は定義が確かめた物）
const worksIn = (records: Readonly<Record<string, Readonly<Record<string, unknown>>>>) =>
  Object.values(records[CURRENT_WORK.id] ?? {}) as { id: string; ticket: string }[]

// チケットが変わったら（作った・変えた・消した）: そのチケットを指すカレントワークのうちカレントチケットでなくなった物を none に、
// 新しくカレントチケットになれたワークルームで、カレントワークが none の物をこのチケットにする
export const FOLLOW_TICKETS: FollowStepDef<typeof TICKET.id> = {
  watches: TICKET.id,
  writes: [CURRENT_WORK.id],
  reads: change => {
    const ticket = change.after === "removed" ? change.before : change.after
    return [READS_CURRENT_WORK, ...(ticket === "none" ? [] : [{ subject: PROJECT.id, id: ticket.project }])]
  },
  follow: (change, ctx) => {
    const ticket = change.after === "removed" ? change.before : change.after
    const project = ticket === "none" ? undefined : (ctx.records[PROJECT.id]?.[ticket.project] as Project | undefined)
    return currentWorkChanges(
      change.before as Ticket | "none",
      change.after as Ticket | "removed",
      project,
      worksIn(ctx.records),
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
    return currentWorkOnLanes(before, after, tickets, worksIn(ctx.records))
  },
}

const lanesChanged = (before: Project | "none", after: Project | "removed"): boolean =>
  before !== "none" && after !== "removed" && JSON.stringify(before.lanes) !== JSON.stringify(after.lanes)
