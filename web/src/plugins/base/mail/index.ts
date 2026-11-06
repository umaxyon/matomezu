// 郵便: 送り手（AI など）から利用者へ届く物。郵便箱は利用者に 1 つで、届いた順に持つ（core/mail.ts）。
// base の郵便の種類は手紙（letter。題と本文）。送るのは mail-send（AI も送れる）、見た・行き先を見た・消すは利用者だけ。
// 既読は 2 つ: 利用者が郵便を開いて見た時点 seenAt（画面の未読の数はこれで数える）と、郵便が示した物を見た時点 visitedAt（AI は read_mail でこれを知る）
import { z } from "zod"
import { freshId } from "../../../core/ids"
import type { Mail, Mailbox } from "../../../core/mail"
import { kit } from "../kit"

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
  // 一覧・しおり・ダイアログに出す題と本文
  shown: { title: (p: LetterProps) => p.title, body: (p: LetterProps) => p.body },
})

const ToSchema = z.strictObject({
  book: z.string().min(1),
  page: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).min(1).optional(),
})

const ID_ARGS = z.strictObject({ mail: z.string().min(1) })

// 郵便箱に残す、いちばん多い数。超えたら、見た郵便のうち古い物から消す（見ていない郵便しか無ければ、古い物から）
export const MAILBOX_LIMIT = 200

// 郵便箱 mailbox を上限までにした並び
export function withinLimit(mailbox: Mailbox): Mailbox {
  let over = mailbox.length - MAILBOX_LIMIT
  if (over <= 0) return mailbox
  const seen = mailbox.filter(m => m.seenAt)
  const drop = new Set(seen.slice(0, over).map(m => m.id))
  over -= drop.size
  for (const m of mailbox) {
    if (over <= 0) break
    if (!drop.has(m.id)) {
      drop.add(m.id)
      over--
    }
  }
  return mailbox.filter(m => !drop.has(m.id))
}

// 郵便箱の id の郵便を change で変えた並び（無いか、change が null を返せば null）
function changeMail(mailbox: Mailbox, id: string, change: (mail: Mail) => Mail | null): Mailbox | null {
  const found = mailbox.find(m => m.id === id)
  const next = found && change(found)
  return found && next ? mailbox.map(m => (m === found ? next : m)) : null
}

export const MAIL_SEND = kit.defineAction({
  id: "mail-send",
  aiDescription:
    "Send a letter to the user's mailbox (it shows at once on the user's screen, wherever the user is). from is a short name telling who sends it (use the same name all through your session, such as your task or work name). title (80 characters at most) and body (optional) are the letter. to points at a place: a book, and optionally a page of it and things (ids) on that page; the user can move there from the letter. The place is not checked now (if it is gone when the user opens the letter, the user is told). The mailbox keeps the newest 200 letters (seen ones go first). Returns the letter's id; read_mail tells later whether the user saw it and the place.",
  title: "Send mail",
  target: "mailbox",
  args: z.strictObject({
    from: z.string().trim().min(1).max(40),
    title: LetterSchema.shape.title,
    body: LetterSchema.shape.body.optional(),
    to: ToSchema.optional(),
  }),
  run: (mailbox, args, ctx) => {
    const id = freshId(
      ctx.newId,
      mailbox.map(m => m.id),
    )
    const letter: Mail = {
      id,
      mail: MAIL_LETTER.id,
      from: args.from,
      sentAt: ctx.now,
      ...(args.to ? { to: args.to } : {}),
      props: { title: args.title, body: args.body ?? "" } satisfies LetterProps,
    }
    return { next: withinLimit([...mailbox, letter]), result: { mail: id } }
  },
})

export const MAIL_SEEN = kit.defineAction({
  id: "mail-seen",
  aiDescription: "Done by the user's screen when the user opens a letter (only the user). Refused if it was seen.",
  title: "Mark mail seen",
  target: "mailbox",
  userOnly: true,
  args: ID_ARGS,
  run: (mailbox, args, ctx) => {
    const next = changeMail(mailbox, args.mail, m => (m.seenAt ? null : { ...m, seenAt: ctx.now }))
    return next ? { next, result: {} } : null
  },
})

export const MAIL_VISITED = kit.defineAction({
  id: "mail-visited",
  aiDescription:
    "Done by the user's screen when the place a letter points at is shown to the user (only the user). Refused if it has no place or it was shown.",
  title: "Mark mail place seen",
  target: "mailbox",
  userOnly: true,
  args: ID_ARGS,
  run: (mailbox, args, ctx) => {
    const next = changeMail(mailbox, args.mail, m => (!m.to || m.visitedAt ? null : { ...m, visitedAt: ctx.now }))
    return next ? { next, result: {} } : null
  },
})

export const MAIL_REMOVE = kit.defineAction({
  id: "mail-remove",
  aiDescription: "Remove a letter from the mailbox (only the user).",
  title: "Remove mail",
  target: "mailbox",
  userOnly: true,
  args: ID_ARGS,
  run: (mailbox, args) => {
    const next = mailbox.filter(m => m.id !== args.mail)
    return next.length === mailbox.length ? null : { next, result: {} }
  },
})
