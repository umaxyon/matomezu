// チケットの完了: チケットを完了のレーン（プロジェクトの doneLane）へ移し、担当を外し、チケット履歴に完了の行（外した担当を持つ）を足す。
// この 3 つと、このチケットを指すカレントワークを none にするのを 1 つのアクション（1 トランザクション）で行い、途中の状態を作らない（担当が外れるので、そのチケットは誰のカレントチケットでもなくなる）。
// 完了かどうかは、チケットのレーンが完了のレーンかで決まる（完了のレーンへ入れる道はこのアクションだけで、ほかの書き手は断る）。
// AI が完了したら、管理者のワークルーム（自分でないとき）の AI に AI 間メッセージで知らせる（利用者が完了したときは知らせない）
import { z as zod } from "zod"
import { type Actor, type AIMessage, NO_WORKROOM, workroomOfActor } from "../../../plugin-api"
import { adminWorkroom, READS_ADMIN, READS_WORKROOM_KEYS } from "../../base"
import { byOf, type Records, readsBy, workroomsOf } from "../by"
import { kit } from "../kit"
import { inDoneLane, type Project } from "../project"
import { projectOf } from "../project/actions"
import { TICKET, type Ticket } from "../ticket"
import { ticketLabel } from "../ticket/label"
import { HISTORY, TOPIC_COMPLETE } from "../ticket-history"

// 管理者のワークルームの AI への知らせ（行う者がワークルームの AI で、管理者のワークルームが自分でないときだけ。宛先に AI がいなければ送らないだけ）
function completedMessages(actor: Actor, ctx: Records, ticket: Ticket, project: Project): AIMessage[] {
  const own = workroomOfActor(actor)
  if (own === NO_WORKROOM) return []
  const admin = adminWorkroom(ctx)
  if (admin === NO_WORKROOM || admin === own) return []
  const names = new Map(workroomsOf(ctx).map(w => [w.id, w.name]))
  const released = ticket.assignees.map(w => names.get(w) ?? w)
  return [
    {
      workroom: admin,
      text: `The ticket ${ticketLabel(project.prefix, ticket.number)} "${ticket.name}" (${ticket.id}) was completed${
        released.length > 0 ? `; released: ${released.join(", ")}` : ""
      }.`,
      noRecipient: "skip",
    },
  ]
}

export const TICKET_COMPLETE = kit.defineAction({
  id: "ticket-complete",
  title: "complete ticket",
  aiDescription:
    "Complete the ticket named by on.record when its work is done (for example when its commits are merged and no work is left): it moves to the done lane of its project, its assignees are released (so it is nobody's current ticket any more, and the workrooms working on it have no current ticket), and a line of the topic topic-complete (with the released workrooms) is added to its history, all at once. Refused when the project has no done lane (the user chooses it in the project settings) or the ticket is in it already. Moving a ticket into the done lane in any other way is refused; to take a ticket out of the done lane again, change its lane with ticket-update, and assign workrooms again if needed. When an AI completes it, the administrator's workroom (when it is not yours) is told by an AI message (matomezu sends it when an AI has joined that workroom; you do not). Returns the done lane and the released workrooms' ids.",
  target: TICKET.id,
  writes: [HISTORY.id],
  // AI が行うときは、知らせる先（管理者の印と全部のワークルームの索引キー）も
  reads: (_args, actor) => [
    ...readsBy(actor),
    ...(workroomOfActor(actor) === NO_WORKROOM ? [] : [READS_ADMIN, READS_WORKROOM_KEYS]),
  ],
  args: zod.strictObject({}),
  run: (now, _args, ctx) => {
    if (now === "none") return null
    const project = projectOf(ctx, now.project)
    if (!project) return { declined: "the project of the ticket is not there" }
    if (project.doneLane === undefined)
      return { declined: "the project has no done lane: the user chooses it in the project settings" }
    if (inDoneLane(project, now.lane)) return { declined: "the ticket is completed already" }
    const by = byOf(ctx.actor, ctx)
    if (!by) return { declined: "the workroom of the AI is not there" }
    const historyId = ctx.newId()
    const messages = completedMessages(ctx.actor, ctx, now, project)
    const next = { ...now, lane: project.doneLane, assignees: [], updatedAt: ctx.now }
    return {
      next,
      others: [
        {
          subject: HISTORY.id,
          id: historyId,
          record: {
            id: historyId,
            ticket: now.id,
            topic: TOPIC_COMPLETE.id,
            text: "",
            at: ctx.now,
            by,
            ...(now.assignees.length > 0 ? { released: now.assignees } : {}),
          },
        },
      ],
      result: { lane: project.doneLane, released: now.assignees },
      ...(messages.length > 0 ? { aiMessages: messages } : {}),
    }
  },
})
