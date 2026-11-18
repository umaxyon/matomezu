// 郵便: 送り手（AI など）から利用者へ届く物。郵便 1 通は対象の定義 mail のレコード 1 件で、届いた順は番号 order（core/mail.ts）。
// base の郵便の種類は手紙（letter。題と本文）。送るのは mail-send（AI も送れる）、見た・行き先を見た・消すは利用者だけ（on の record で郵便を指す）。
// 既読は 2 つ: 利用者が郵便を開いて見た時点 seenAt（画面の未読の数はこれで数える）と、郵便が示した物を見た時点 visitedAt（AI は read_records でこれを知る）
import { z } from "zod"
import { kit } from "../kit"
import { ticketsOnRemoved } from "./removed"
import { MAIL, mailAdded, readsMailSender } from "./subject"

export { MAIL, MAILBOX_LIMIT, mailAdded, mailboxOf, READS_MAILBOX_KEYS } from "./subject"

const LetterSchema = z.strictObject({
  title: z.string().trim().min(1).max(80), // 題（一覧・しおり・ダイアログの見出し）
  body: z.string().max(4000), // 本文（空でもよい）
})
export type LetterProps = z.output<typeof LetterSchema>

export const MAIL_LETTER = kit.defineMail({
  id: "letter",
  title: "Mail letter",
  aiDescription:
    "A letter to the user: title, an optional body, and an optional place it points at (to: a book, a page in it, things on the page). The user opens it from their mailbox and moves to the place from it.",
  props: LetterSchema,
  aiBrief: (p: LetterProps) => p.title,
  // 一覧・しおり・ダイアログに出す題と本文
  shown: { title: (p: LetterProps) => p.title, body: (p: LetterProps) => p.body },
})

const ToSchema = z.strictObject({
  book: z.string().min(1),
  page: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).min(1).optional(),
})

// 宛先の郵便（on の record）だけで行うアクションの引数
const NO_ARGS = z.strictObject({})

export const MAIL_SEND = kit.defineAction({
  id: "mail-send",
  aiDescription:
    "Send a letter to the user's mailbox (it shows at once on the user's screen, wherever the user is). from is a short name telling who sends it (use the same name all through your session, such as your task or work name). title (80 characters at most) and body (optional) are the letter. to points at a place: a book, and optionally a page of it and things (ids) on that page; the user can move there from the letter. The place is not checked now (if it is gone when the user opens the letter, the user is told). The mailbox keeps the newest 200 letters (seen ones go first). Returns the letter's id; read_records (kind @matomezu/base:mail) tells later whether the user saw it and the place.",
  title: "Send mail",
  target: MAIL.id,
  reads: (_, actor) => readsMailSender(actor),
  args: z.strictObject({
    from: z.string().trim().min(1).max(40),
    title: LetterSchema.shape.title,
    body: LetterSchema.shape.body.optional(),
    to: ToSchema.optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const added = mailAdded(ctx, {
      mail: MAIL_LETTER.id,
      from: args.from,
      sentAt: ctx.now,
      ...(args.to ? { to: args.to } : {}),
      props: { title: args.title, body: args.body ?? "" } satisfies LetterProps,
    })
    return (
      added && {
        next: added.next,
        others: added.others,
        result: { mail: added.next.id },
        aiEditTickets: added.aiEditTickets,
      }
    )
  },
})

export const MAIL_SEEN = kit.defineAction({
  id: "mail-seen",
  aiDescription:
    "Done by the user's screen when the user opens the letter named by on.record (only the user). Refused if it was seen.",
  title: "Mark mail seen",
  target: MAIL.id,
  userOnly: true,
  bulk: "alone", // 見た事は、同じ処理のほかのアクションが断られても変わらない
  args: NO_ARGS,
  run: (now, _, ctx) => (now === "none" || now.seenAt ? null : { next: { ...now, seenAt: ctx.now }, result: {} }),
})

export const MAIL_VISITED = kit.defineAction({
  id: "mail-visited",
  aiDescription:
    "Done by the user's screen when the place the letter named by on.record points at is shown to the user (only the user). Refused if it has no place or it was shown.",
  title: "Mark mail place seen",
  target: MAIL.id,
  userOnly: true,
  bulk: "alone", // 見た事は、同じ処理のほかのアクションが断られても変わらない
  args: NO_ARGS,
  run: (now, _, ctx) =>
    now === "none" || !now.to || now.visitedAt ? null : { next: { ...now, visitedAt: ctx.now }, result: {} },
})

export const MAIL_REMOVE = kit.defineAction({
  id: "mail-remove",
  aiDescription: "Remove the letter named by on.record from the mailbox (only the user).",
  title: "Remove mail",
  target: MAIL.id,
  userOnly: true,
  args: NO_ARGS,
  // 消す郵便の種類が答えた AI 編集チケットの変え方も返す（removed.ts）
  run: (now, _, ctx) =>
    now === "none"
      ? null
      : { next: "removed" as const, result: {}, aiEditTickets: ticketsOnRemoved(ctx.catalog, [now], "user") },
})
export { MAIL_DIALOG } from "./dialogs"
export { MAIL_JOIN_REQUEST, MAIL_JOIN_REQUEST_SEND } from "./join-request"
export { MAIL_PROPOSAL, PROPOSAL_APPLY, PROPOSAL_SEND, PROPOSAL_SETTLE } from "./proposal"

import type {} from "./shown"

export { type MAIL_BIRD_VISIT, MAIL_STATES } from "./states"
