// チケットの担当の変わりを、ワークルームの AI に常駐メッセージで知らせるフォローステップ（何も書かない）。
// 前からの担当のチケットに別のワークルームが担当に入ったら、前からの担当へ（カレントチケットが変わった知らせは、base が作業の替わりとして送る）
import type { FollowStepDef } from "../../../plugin-api"
import { PROJECT, type Project } from "../project"
import { TICKET } from "../ticket/ticket"
import { ticketText } from "./work"

// チケットの担当に別のワークルームが入ったら、前からの担当（入ったワークルームのほか）へ
export const NOTICE_OTHER_ASSIGNED: FollowStepDef<typeof TICKET.id> = {
  watches: TICKET.id,
  writes: [],
  reads: change => (change.after === "removed" ? [] : [{ subject: PROJECT.id, id: change.after.project }]),
  follow: (change, ctx) => {
    const { before, after } = change
    if (before === "none" || after === "removed") return {}
    const added = after.assignees.filter(w => !before.assignees.includes(w))
    const kept = after.assignees.filter(w => before.assignees.includes(w))
    if (added.length === 0 || kept.length === 0) return {}
    const project = ctx.record(PROJECT.id, after.project) as Project | "none"
    const text = `Another workroom (${added.join(", ")}) was assigned to your ticket ${ticketText(after, project === "none" ? undefined : project)}.`
    return { hostMessages: kept.map(workroom => ({ workroom, text })) }
  },
}
