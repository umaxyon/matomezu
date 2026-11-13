// チケットの完了: チケットを完了のレーン（プロジェクトの doneLane）へ移し、担当を外し、そのチケットを今のチケットにしているワークルームの今のチケットを none にし、
// チケット履歴に完了の行（外した担当を持つ）を足す。この 4 つを 1 つのアクション（1 トランザクション）で行い、途中の状態を作らない。
// 完了かどうかは、チケットのレーンが完了のレーンかで決まる（完了のレーンへ入れる道はこのアクションだけで、ほかの書き手は断る）
import { z as zod } from "zod"
import { byOf, readsBy } from "../by"
import { CURRENT, NO_TICKET } from "../current-ticket"
import { kit } from "../kit"
import { inDoneLane } from "../project"
import { projectOf } from "../project/actions"
import { TICKET } from "../ticket"
import { HISTORY, TOPIC_COMPLETE } from "../ticket-history"

type Current = zod.output<typeof CURRENT.record>

export const TICKET_COMPLETE = kit.defineAction({
  id: "ticket-complete",
  title: "complete ticket",
  aiDescription:
    "Complete the ticket named by on.record when its work is done (for example when its commits are merged and no work is left): it moves to the done lane of its project, its assignees are released, every workroom that declared it as the current ticket gets none, and a line of the topic topic-complete (with the released workrooms) is added to its history, all at once. Refused when the project has no done lane (the user chooses it in the project settings) or the ticket is in it already. Moving a ticket into the done lane in any other way is refused; to take a ticket out of the done lane again, change its lane with ticket-update, and assign workrooms again if needed. Returns the done lane, the released workrooms' ids and the workrooms whose current ticket was cleared.",
  target: TICKET.id,
  writes: [CURRENT.id, HISTORY.id],
  reads: (_args, actor, on) => [
    ...readsBy(actor),
    ...(on === undefined ? [] : [{ subject: CURRENT.id, where: [{ key: "ticket" as const, eq: on }] }]),
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
    const pointing = (Object.values(ctx.records?.[CURRENT.id] ?? {}) as Current[])
      .filter(c => c.ticket === now.id)
      .sort((a, b) => a.id.localeCompare(b.id))
    return {
      next: { ...now, lane: project.doneLane, assignees: [], updatedAt: ctx.now },
      others: [
        {
          subject: HISTORY.id,
          id: ctx.newId(),
          record: {
            id: "",
            ticket: now.id,
            topic: TOPIC_COMPLETE.id,
            text: "",
            at: ctx.now,
            by,
            ...(now.assignees.length > 0 ? { released: now.assignees } : {}),
          },
        },
        ...pointing.map(c => ({
          subject: CURRENT.id,
          id: c.id,
          record: { ...c, ticket: NO_TICKET, at: ctx.now },
        })),
      ].map(o => (o.subject === HISTORY.id ? { ...o, record: { ...o.record, id: o.id } } : o)),
      result: { lane: project.doneLane, released: now.assignees, cleared: pointing.map(c => c.id) },
    }
  },
})
