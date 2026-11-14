// 今のチケットのアクション
import { z as zod } from "zod"
import { isAI } from "../../../plugin-api"
import { kit } from "../kit"
import { inDoneLane, PROJECT } from "../project"
import { projectOf } from "../project/actions"
import { TICKET } from "../ticket"
import { ticketOf } from "../ticket/actions"
import { CURRENT, NO_TICKET } from "."

// AI が自分のワークルームの今のチケットを宣言する（表示のため）。最初は on を省き、2 回目からは on.record に自分のワークルームの id を書く
export const CURRENT_TICKET_SET = kit.defineAction({
  id: "current-ticket-set",
  title: "set current ticket",
  aiDescription:
    "Declare the ticket your workroom is working on now (only to be shown to the user; it decides nothing), or none when you work on none. Only an AI in a workroom, and only for its own workroom. A ticket in the done lane of its project is refused (it is completed); completing a ticket with ticket-complete sets the current ticket of every workroom that pointed at it to none. The first time, leave on out; after that, set on.record to your workroom's id (the id this action returned as current; not the id of the participant). Leaving on out when your workroom's record is already there is refused.",
  target: CURRENT.id,
  // 宣言するチケットと、そのチケットのプロジェクトを引く（完了のレーンのチケットは宣言させない）
  reads: args =>
    args.ticket === NO_TICKET
      ? []
      : [
          { subject: TICKET.id, id: args.ticket },
          { subject: PROJECT.id, where: [], keysOnly: true as const },
        ],
  args: zod.strictObject({ ticket: zod.string().min(1) }),
  run: (now, args, ctx) => {
    if (!isAI(ctx.actor) || ctx.actor.workroom === "none")
      return { declined: "only an AI in a workroom declares its current ticket" }
    const id = ctx.actor.workroom.id
    if (now !== "none" && now.id !== id) return { declined: "a workroom declares only its own current ticket" }
    if (args.ticket !== NO_TICKET) {
      const ticket = ticketOf(ctx, args.ticket)
      if (!ticket) return { declined: "the ticket is not there" }
      const project = projectOf(ctx, ticket.project)
      if (project && inDoneLane(project, ticket.lane))
        return { declined: "the ticket is completed: a completed ticket is not a current ticket" }
    }
    return { next: { id, ticket: args.ticket, at: ctx.now }, result: { current: id } }
  },
})
