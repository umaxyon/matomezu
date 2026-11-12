// チケット履歴: チケット 1 枚についての、書いた者・時点・題（状況・プラン・質問など）・本文の 1 行。1 行が 1 件のレコードで、足すだけ（直す・消すアクションは無い）。
// 題（topic）は列挙 history-topic の値の id で、ほかのプラグインが足せる。値が列挙から無くなっても、行は残る（読む側が扱う）。
// 起票は履歴の行にせず、チケットの createdAt・createdBy から見せる
import { z } from "zod"
import { PALETTE } from "../../plugin-api"
import { BY } from "./by"
import { kit } from "./kit"
import { TICKET } from "./ticket"

export const HISTORY_TOPIC = kit.defineEnum({
  id: "history-topic",
  title: "history topic",
  aiDescription:
    "The topics of the lines of a ticket's history, such as a status report, a plan and a question. ticket-history-add takes the id of one of them as its topic.",
  value: z.strictObject({ color: z.enum(PALETTE) }), // 題を描く色の役割
})

export const TOPIC_STATUS = kit.defineEnumValue({
  id: "topic-status",
  enum: HISTORY_TOPIC.id,
  title: "topic status",
  aiDescription: "A report of how the work stands.",
  data: { color: "primary" },
})
export const TOPIC_PLAN = kit.defineEnumValue({
  id: "topic-plan",
  enum: HISTORY_TOPIC.id,
  title: "topic plan",
  aiDescription: "A plan: what will be done and how, before doing it.",
  data: { color: "success" },
})
export const TOPIC_QUESTION = kit.defineEnumValue({
  id: "topic-question",
  enum: HISTORY_TOPIC.id,
  title: "topic question",
  aiDescription: "A question to the user that blocks or changes the work.",
  data: { color: "warn" },
})

export const HISTORY = kit.defineSubject({
  id: "ticket-history",
  title: "ticket history",
  aiDescription:
    "One line of a ticket's history: the ticket's id, the topic (the id of a value of the enum history-topic), the text, the time and who wrote it (the user, or the workroom of an AI as it was then). Lines are only added.",
  record: z.strictObject({
    id: z.string().min(1),
    ticket: z.string().min(1),
    topic: z.string().min(1),
    text: z.string().min(1),
    at: z.string(),
    by: BY,
  }),
  refers: h => [{ subject: TICKET.id, id: h.ticket }],
  aiOrder: h => Date.parse(h.at) || 0,
  aiBrief: h => `${h.topic}: ${h.text}`,
})
