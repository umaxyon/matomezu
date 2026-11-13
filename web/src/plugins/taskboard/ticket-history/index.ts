// チケット履歴: チケット 1 枚についての、書いた者・時点・題（状況・プラン・質問など）・本文の 1 行。1 行が 1 件のレコードで、足すだけ（直す・消すアクションは無い）。
// 題（topic）は列挙 history-topic の値の id で、ほかのプラグインが足せる。値が列挙から無くなっても、行は残る（読む側が扱う）。
// 起票は履歴の行にせず、チケットの createdAt・createdBy から見せる
import { z } from "zod"
import { PALETTE } from "../../../plugin-api"
import { BY } from "../by"
import { kit } from "../kit"
import { TICKET } from "../ticket"

export const HISTORY_TOPIC = kit.defineEnum({
  id: "history-topic",
  title: "history topic",
  aiDescription:
    "The topics of the lines of a ticket's history, such as a status report, a plan and a question. ticket-history-add takes the id of one of them as its topic.",
  value: z.strictObject({ color: z.enum(PALETTE), asksUser: z.boolean().optional(), textless: z.boolean().optional() }), // 題を描く色の役割と、利用者への質問か（質問は、見せる側が押せる吹き出しにする）、行に文を持たなくてよいか（持たない題の行の文は、見せる側が題から決める）
})

// 列挙 history-topic の値の data の形
export type TopicData = z.output<typeof HISTORY_TOPIC.value>

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
  data: { color: "secondary" },
})
export const TOPIC_QUESTION = kit.defineEnumValue({
  id: "topic-question",
  enum: HISTORY_TOPIC.id,
  title: "topic question",
  aiDescription: "A question to the user that blocks or changes the work.",
  data: { color: "warn", asksUser: true },
})

export const TOPIC_BODY = kit.defineEnumValue({
  id: "topic-body",
  enum: HISTORY_TOPIC.id,
  title: "topic body",
  aiDescription:
    "The body of the ticket was rewritten (the screen writes this line, without text, when the user leaves the ticket after changing the body).",
  data: { color: "muted", textless: true },
})

export const TOPIC_COMPLETE = kit.defineEnumValue({
  id: "topic-complete",
  enum: HISTORY_TOPIC.id,
  title: "topic complete",
  aiDescription:
    "The ticket was completed (ticket-complete writes this line, without text, and keeps the assignees it released in released). Do not write it yourself: complete the ticket with ticket-complete.",
  data: { color: "success", textless: true },
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
    text: z.string(), // 文を持たなくてよい題（data.textless）の行だけ空にできる（行う側が確かめる）
    at: z.string(),
    by: BY,
    released: z.array(z.string().min(1)).optional(), // 完了の行だけが持つ: 完了で担当を外した、ワークルームの id（担当と同じに、消したワークルームの id は書いたまま残し、読む側が外す）
  }),
  refers: h => [{ subject: TICKET.id, id: h.ticket }],
  aiOrder: h => Date.parse(h.at) || 0,
  aiBrief: h => `${h.topic}: ${h.text}`,
})

export type HistoryRecord = z.output<typeof HISTORY.record>

// チケット履歴の行を新しい順に（同じ時点なら id の降順）。画面ごとに並べ方を変えず、ここで 1 つに決める
export const newestFirst = <T extends { at: string; id: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))
