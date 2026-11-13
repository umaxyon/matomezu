// ワークルームごとの今のチケット: AI が自分のワークルームで今取り組むチケットを宣言し、画面に出すための物（表示のためだけで、ほかの動きを決めない）。
// 1 件がワークルーム 1 つ分のレコードで、id はワークルームの id と同じ。ticket は取り組むチケットの id か、取り組んでいないときの none
import { z } from "zod"
import { WORKROOM_SUBJECT } from "../by"
import { kit } from "../kit"
import { TICKET } from "../ticket"

export const NO_TICKET = "none"

export const CURRENT = kit.defineSubject({
  id: "current-ticket",
  title: "current ticket",
  aiDescription:
    "The ticket a workroom is working on now, as the AI of that workroom declared it (only to be shown; it decides nothing; completing the ticket sets it to none). The record's id is the workroom's id; ticket is a ticket's id, or none.",
  record: z.strictObject({
    id: z.string().min(1),
    ticket: z.string().min(1),
    at: z.string(),
  }),
  // 今のチケットが指すチケットから、指しているワークルームを探す（完了で空にするときなど）
  keys: { ticket: { type: "text", of: c => c.ticket } },
  refers: c => [
    { subject: WORKROOM_SUBJECT, id: c.id },
    ...(c.ticket === NO_TICKET ? [] : [{ subject: TICKET.id, id: c.ticket }]),
  ],
  aiBrief: c => `${c.id}: ${c.ticket}`,
})
