// チケット履歴のアクション
import { type z, z as zod } from "zod"
import { enumValuesOf } from "../../../plugin-api"
import { byOf, WORKROOM_SUBJECT } from "../by"
import { kit } from "../kit"
import { TICKET } from "../ticket"
import { ticketsIn } from "../ticket/actions"
import { HISTORY, HISTORY_TOPIC, type TopicData } from "."

// 履歴の行を足す。書いた者は行った者（引数では受けない）。題は、列挙 history-topic の値の id
export const TICKET_HISTORY_ADD = kit.defineAction({
  id: "ticket-history-add",
  title: "add ticket history",
  aiDescription:
    "Add a line to the history of the ticket (its id): topic is the id of a value of the enum history-topic (the values are listed in the arguments), text is what to write (needed, except for a topic whose data says textless). The line records you (your workroom, as it is now) and the time. Lines cannot be changed or removed later. The ticket's own time of the last change does not move.",
  target: HISTORY.id,
  reads: [TICKET.id, WORKROOM_SUBJECT],
  args: zod.strictObject({ ticket: zod.string().min(1), topic: zod.string().min(1), text: zod.string() }),
  describeArgs: catalog => {
    const topics = enumValuesOf(catalog, HISTORY_TOPIC.id)
    const ids = topics.map(v => v.id) as [string, ...string[]]
    // 題の候補と、いつ選ぶかの説明（値の aiDescription）を、引数の説明に並べる
    const topic =
      ids.length > 0
        ? zod
            .enum(ids)
            .describe(
              topics
                .map(v => `${v.id}: ${v.aiDescription}${(v.data as TopicData).textless ? " (text may be empty)" : ""}`)
                .join("\n"),
            )
        : zod.string().min(1)
    return zod.strictObject({ ticket: zod.string().min(1), topic, text: zod.string() })
  },
  run: (now, args, ctx) => {
    if (now !== "none") return null
    if (!ticketsIn(ctx).some(t => t.id === args.ticket)) return { declined: "the ticket is not there" }
    const topic = enumValuesOf(ctx.catalog, HISTORY_TOPIC.id).find(v => v.id === args.topic)
    if (!topic) return { declined: "the topic is not a value of history-topic" }
    if (args.text.trim() === "" && !(topic.data as TopicData).textless) return { declined: "the topic needs a text" }
    const by = byOf(ctx.actor, ctx)
    if (!by) return { declined: "the workroom of the AI is not there" }
    const line: z.output<typeof HISTORY.record> = {
      id: ctx.newId(),
      ticket: args.ticket,
      topic: args.topic,
      text: args.text,
      at: ctx.now,
      by,
    }
    return { next: line, result: { line: line.id } }
  },
})
