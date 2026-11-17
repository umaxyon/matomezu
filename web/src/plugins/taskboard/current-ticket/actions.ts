// 今のチケットのアクション
import { z as zod } from "zod"
import { isAI } from "../../../plugin-api"
import { isAdminActor, READS_ADMIN } from "../../base"
import { READS_WORKROOM_NAMES, type Records, workroomsOf } from "../by"
import { kit } from "../kit"
import { inDoneLane, PROJECT } from "../project"
import { projectOf } from "../project/actions"
import { TICKET } from "../ticket"
import { ticketOf } from "../ticket/actions"
import { resolve } from "../ticket/resolve"
import { CURRENT, NO_TICKET } from "."

// AI がワークルームの今のチケットを宣言する（表示のため）。自分のワークルームの分は誰でも、ほかのワークルームの分は管理者のワークルームの AI だけ。
// 記録の無いワークルームは on を省いて作り（ほかのワークルームなら workroom で指す）、記録があれば on.record にそのワークルームの id を書く（workroom は書かない）
export const CURRENT_TICKET_SET = kit.defineAction({
  id: "current-ticket-set",
  title: "set current ticket",
  aiDescription:
    "Declare the ticket a workroom is working on now (only to be shown to the user; it decides nothing), or none when it works on none. Only an AI in a workroom: for its own workroom, or, only when its workroom has the administrator's mark, for another workroom. A ticket in the done lane of its project is refused (it is completed); completing a ticket with ticket-complete sets the current ticket of every workroom that pointed at it to none. Declaring for another workroom sends an AI message to the AI in that workroom (matomezu sends it; you do not), and is refused (no-recipient) when no AI has joined that workroom. When the workroom has no record yet, leave on out (for another workroom, give workroom: its id or name); when it has one, set on.record to that workroom's id (the id this action returned as current; not the id of the participant) and leave workroom out. Leaving on out when the workroom's record is already there is refused.",
  target: CURRENT.id,
  // 宣言するチケットとそのプロジェクト（完了のレーンのチケットは宣言させない）、ワークルームを名前でも指すならワークルームの名前、自分のほかの分なら管理者の印
  reads: (args, actor, on) => {
    const own = isAI(actor) && actor.workroom !== "none" ? actor.workroom.id : undefined
    const other = args.workroom !== undefined || (on !== undefined && on !== own)
    return [
      ...(args.ticket === NO_TICKET
        ? []
        : [
            { subject: TICKET.id, id: args.ticket },
            { subject: PROJECT.id, where: [], keysOnly: true as const },
          ]),
      ...(args.workroom !== undefined ? [READS_WORKROOM_NAMES] : []),
      ...(other ? [READS_ADMIN] : []),
    ]
  },
  args: zod.strictObject({ ticket: zod.string().min(1), workroom: zod.string().min(1).optional() }),
  run: (now, args, ctx) => {
    if (!isAI(ctx.actor) || ctx.actor.workroom === "none")
      return { declined: "only an AI in a workroom declares a current ticket" }
    if (now !== "none" && args.workroom !== undefined)
      return { declined: "on.record already says the workroom: leave workroom out" }
    const target = now !== "none" ? { id: now.id } : resolveWorkroom(ctx, args.workroom, ctx.actor.workroom.id)
    if ("declined" in target) return target
    const id = target.id
    if (id !== ctx.actor.workroom.id && !isAdminActor(ctx.actor, ctx))
      return { declined: "only the AI of the administrator's workroom declares another workroom's current ticket" }
    const ticket = args.ticket === NO_TICKET ? undefined : ticketOf(ctx, args.ticket)
    if (args.ticket !== NO_TICKET) {
      if (!ticket) return { declined: "the ticket is not there" }
      const project = projectOf(ctx, ticket.project)
      if (project && inDoneLane(project, ticket.lane))
        return { declined: "the ticket is completed: a completed ticket is not a current ticket" }
    }
    const next = { id, ticket: args.ticket, at: ctx.now }
    if (id === ctx.actor.workroom.id) return { next, result: { current: id } }
    // ほかのワークルームの分を決めたら、そのワークルームの AI に知らせる（宛先に参加の確定した AI がいなければ、常駐がバルクごと断る）
    const told = ticket ? `"${ticket.name}" (${ticket.id})` : "none"
    return {
      next,
      result: { current: id },
      aiMessages: [{ workroom: id, text: `The administrator set your workroom's current ticket to ${told}.` }],
    }
  },
})

// 作る記録のワークルーム: workroom（id か名前）を読んだワークルームから決める。無ければ自分のワークルーム
const resolveWorkroom = (ctx: Records, ref: string | undefined, own: string) =>
  ref === undefined ? { id: own } : resolve(ref, workroomsOf(ctx), "workroom")
