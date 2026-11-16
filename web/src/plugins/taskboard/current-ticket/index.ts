// ワークルームごとの今のチケット: AI が自分のワークルームで今取り組むチケットを宣言し、画面に出すための物（表示のためだけで、ほかの動きを決めない）。
// 1 件がワークルーム 1 つ分のレコードで、id はワークルームの id と同じ。ticket は取り組むチケットの id か、取り組んでいないときの none
import { z } from "zod"
import { WORKROOM_SUBJECT } from "../by"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"

export const NO_TICKET = "none"

// ワークルームの今のチケットとそのプロジェクト（宣言が無い・none・チケットかプロジェクトが無ければ none）。
// 参加者の一覧の行の下の 1 行（WorkroomRowLine）と、作業の様子（workroomActivity）が同じ判定を使う。read はレコードを種類と id で読む（無ければ none）
export function currentPairOf(
  workroom: string,
  read: (subject: string, id: string) => unknown,
): { ticket: z.output<typeof TICKET.record>; project: z.output<typeof PROJECT.record> } | "none" {
  const current = CURRENT.record.safeParse(read(CURRENT.id, workroom))
  if (!current.success || current.data.ticket === NO_TICKET) return "none"
  const ticket = TICKET.record.safeParse(read(TICKET.id, current.data.ticket))
  if (!ticket.success) return "none"
  const project = PROJECT.record.safeParse(read(PROJECT.id, ticket.data.project))
  return project.success ? { ticket: ticket.data, project: project.data } : "none"
}

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
  // 参加者リストの並びを見せるためだけ（今のチケットは、ほかの動きを決めない）
  workroomActivity: (workroom, read) => (currentPairOf(workroom, read) === "none" ? "idle" : "working"),
})
