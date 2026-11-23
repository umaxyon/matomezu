// カレントワークとチケットの担当の変わりを、ワークルームの AI に常駐メッセージで知らせるフォローステップ（何も書かない）。
// カレントチケットが変わったら、そのワークルームへ作業机を読み直すように。前からの担当のチケットに別のワークルームが担当に入ったら、前からの担当へ
import type { FollowStepDef } from "../../../plugin-api"
import { MY_WORKDESK } from "../../base"
import { PROJECT, type Project } from "../project"
import { ticketLabel } from "../ticket/label"
import { TICKET, type Ticket } from "../ticket/ticket"
import { CURRENT_WORK, NO_TICKET } from "./work"

// チケット ticket の番号の見せ方（プロジェクトが読めなければプレフィクス無し）と名前
const ticketText = (ticket: Ticket, project: Project | undefined) =>
  `${ticketLabel(project?.prefix ?? "", ticket.number)} "${ticket.name}" (${ticket.id})`

// カレントチケットが変わったら（ワークルームのカレントワークを作った・変えた。消えたのはワークルームが消えたとき）、そのワークルームへ
export const NOTICE_CURRENT_TICKET: FollowStepDef<typeof CURRENT_WORK.id> = {
  watches: CURRENT_WORK.id,
  writes: [],
  reads: change =>
    change.after === "removed" || change.after.ticket === NO_TICKET
      ? []
      : // チケットのプロジェクトは読むまで分からないので、プロジェクトは全部（数は少ない）
        [
          { subject: TICKET.id, id: change.after.ticket },
          { subject: PROJECT.id, where: [] },
        ],
  follow: (change, ctx) => {
    const { before, after } = change
    if (after === "removed") return {}
    const was = before === "none" ? NO_TICKET : before.ticket
    if (was === after.ticket) return {}
    if (after.ticket === NO_TICKET)
      return {
        hostMessages: [
          {
            workroom: change.id,
            text: `Your workroom has no current ticket now. Your workdesk now shows your workroom's own worker book: read your workdesk again (read_folder with folder "${MY_WORKDESK}").`,
          },
        ],
      }
    const ticket = ctx.record(TICKET.id, after.ticket) as Ticket | "none"
    if (ticket === "none") return {}
    const project = ctx.record(PROJECT.id, ticket.project) as Project | "none"
    return {
      hostMessages: [
        {
          workroom: change.id,
          text: `Your current ticket is now ${ticketText(ticket, project === "none" ? undefined : project)}. Your workdesk now shows the worker book of that ticket: read your workdesk again (read_folder with folder "${MY_WORKDESK}").`,
        },
      ],
    }
  },
}

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
