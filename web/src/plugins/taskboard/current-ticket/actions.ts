// 今のチケットのアクション
import { z as zod } from "zod"
import { isAI } from "../../../plugin-api"
import { WORKROOM_SUBJECT } from "../by"
import { kit } from "../kit"
import { TICKET } from "../ticket"
import { ticketsIn } from "../ticket/actions"
import { CURRENT, NO_TICKET } from "."

// AI が自分のワークルームの今のチケットを宣言する（表示のため）。最初は on を省き、2 回目からは on.record に自分のワークルームの id を書く
export const CURRENT_TICKET_SET = kit.defineAction({
  id: "current-ticket-set",
  title: "set current ticket",
  aiDescription:
    "Declare the ticket your workroom is working on now (only to be shown to the user; it decides nothing), or none when you work on none. Only an AI in a workroom, and only for its own workroom. The first time, leave on out; after that, set on.record to your workroom's id (the id this action returned as current).",
  target: CURRENT.id,
  reads: [TICKET.id, WORKROOM_SUBJECT],
  args: zod.strictObject({ ticket: zod.string().min(1) }),
  run: (now, args, ctx) => {
    if (!isAI(ctx.actor) || ctx.actor.workroom === "none")
      return { declined: "only an AI in a workroom declares its current ticket" }
    const id = ctx.actor.workroom.id
    if (now !== "none" && now.id !== id) return { declined: "a workroom declares only its own current ticket" }
    if (args.ticket !== NO_TICKET && !ticketsIn(ctx).some(t => t.id === args.ticket))
      return { declined: "the ticket is not there" }
    return { next: { id, ticket: args.ticket, at: ctx.now }, result: { current: id } }
  },
})
