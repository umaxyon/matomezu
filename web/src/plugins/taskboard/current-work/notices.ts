// カレントワークとチケットの担当の変わりを、ワークルームの AI に常駐メッセージで知らせるフォローステップ（何も書かない）。
// カレントチケットが変わったら、そのワークルームへ作業机を読み直すように（無くなって、担当で作業中のレーンにあるチケットが残っていれば、それを並べ、どれにするかを利用者に聞くように）。前からの担当のチケットに別のワークルームが担当に入ったら、前からの担当へ
import type { FollowContext, FollowStepDef } from "../../../plugin-api"
import { MY_WORKDESK } from "../../base"
import { PROJECT, type Project } from "../project"
import { TICKET, type Ticket } from "../ticket/ticket"
import {
  CURRENT_WORK,
  NO_TICKET,
  openTicketsIn,
  READS_ASSIGNED_TICKETS,
  READS_PROJECTS,
  ticketText,
  waitingLineOf,
} from "./work"

// カレントチケットが変わったら（ワークルームのカレントワークを作った・変えた。消えたのはワークルームが消えたとき）、そのワークルームへ
export const NOTICE_CURRENT_TICKET: FollowStepDef<typeof CURRENT_WORK.id> = {
  watches: CURRENT_WORK.id,
  writes: [],
  reads: change =>
    change.after === "removed"
      ? []
      : change.after.ticket === NO_TICKET
        ? [READS_ASSIGNED_TICKETS, READS_PROJECTS]
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
    if (after.ticket === NO_TICKET) {
      const waiting = waitingText(change.id, ctx.records, was)
      return {
        hostMessages: [
          {
            workroom: change.id,
            text: `Your workroom has no current ticket now.${waiting ? ` ${waiting}` : ""} Your workdesk now shows your workroom's own worker book: read your workdesk again (read_folder with folder "${MY_WORKDESK}").`,
          },
        ],
      }
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

// カレントチケットの無いワークルーム workroom への、担当で作業中のレーンに残るチケット（except を除く）の文（waitingLineOf。無ければ空）。
// records は担当のいるチケットと全部のプロジェクトを読んだ物
function waitingText(workroom: string, records: FollowContext["records"], except: string): string {
  const { tickets, projectOf } = openTicketsIn(records)
  return waitingLineOf(workroom, tickets, projectOf, [except])
}
