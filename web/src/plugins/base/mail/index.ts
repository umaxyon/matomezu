// 郵便: 送り手（AI など）から利用者へ届く物。郵便 1 通は対象の定義 mail のレコード 1 件で、届いた順は番号 order（core/mail.ts）。
// base の郵便の種類は手紙（letter。題と本文）。送るのは mail-send（AI も送れる）、見た・行き先を見た・消すは利用者だけ（on の record で郵便を指す）。
// 既読は 2 つ: 利用者が郵便を開いて見た時点 seenAt（画面の未読の数はこれで数える）と、郵便が示した物を見た時点 visitedAt（AI は read_mail でこれを知る）
import { z } from "zod"
import type { ActionContext } from "../../../core/def/action"
import { freshId } from "../../../core/ids"
import { MAIL_ORDER_SCOPE, type Mail, MailSchema, mailsInOrder } from "../../../core/mail"
import { inOrder } from "../../../core/record-keys"
import { RECORDS_MAX, type Records } from "../../../core/records"
import { kit } from "../kit"

// 郵便のレコードの種類。read_mail と重ならないよう、AI の read_records には見せない（aiBrief を書かない）
export const MAIL = kit.defineSubject({
  id: "mail",
  title: "Mail",
  aiDescription: "A letter in the user's mailbox (read it with read_mail).",
  role: "mails",
  numbered: true,
  record: MailSchema,
  // 届いた順の番号と、利用者が見た時点（見ていなければ無い）
  keys: {
    order: { type: "number", of: m => m.order },
    seenAt: { type: "text", of: m => m.seenAt },
  },
})

// 郵便を 1 通足すアクションが読む物: 今ある郵便全部の、索引キーだけ（上限で消す古い郵便と、重ならない id を決めるのに使う。本文は読まない）
export const READS_MAILBOX_KEYS = () => [{ subject: MAIL.id, where: [], keysOnly: true as const }]

// 郵便箱の 1 通の、索引キーから分かる所（届いた順に並べた物）
interface MailKeys {
  id: string
  seen: boolean
}

// 郵便のレコードを届いた順に並べた郵便箱（画面のフックが読む）
export const mailboxOf = (records: Records): readonly Mail[] => mailsInOrder(Object.values(records[MAIL.id] ?? {}))

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

// 郵便箱に残す、いちばん多い数。超えたら、見た郵便のうち古い物から消す（見ていない郵便しか無ければ、古い物から）
export const MAILBOX_LIMIT = 200

// 郵便箱 mailbox（届いた順）を上限までにするために消す郵便の id（アクション 1 回で変えられる数を超えない）
function overLimit(mailbox: readonly MailKeys[]): readonly string[] {
  let over = Math.min(mailbox.length - MAILBOX_LIMIT, RECORDS_MAX - 1)
  if (over <= 0) return []
  const seen = mailbox.filter(m => m.seen)
  const drop = new Set(seen.slice(0, over).map(m => m.id))
  over -= drop.size
  for (const m of mailbox) {
    if (over <= 0) break
    if (!drop.has(m.id)) {
      drop.add(m.id)
      over--
    }
  }
  return mailbox.flatMap(m => (drop.has(m.id) ? [m.id] : []))
}

// 郵便を 1 通足すアクション（mail-send・proposal-send・mail-join-request）が返す物: 足す郵便（id と届いた順の番号を振る）と、上限を守るために消す古い郵便。
// 今ある郵便は、索引キーだけを ctx.keys から読む（アクションの reads に READS_MAILBOX_KEYS を書く）。番号を受け取れなければ null
export function mailAdded(
  ctx: ActionContext,
  mail: Omit<Mail, "id" | "order">,
): { next: Mail; others: readonly { id: string; record: "removed" }[] } | null {
  if (!ctx.number) return null
  const mailbox: MailKeys[] = inOrder(
    Object.entries(ctx.keys?.[MAIL.id] ?? {}).map(([id, keys]) => ({ id, keys })),
    { key: "order", dir: "asc" },
  ).map(m => ({ id: m.id, seen: m.keys.seenAt !== undefined }))
  const id = freshId(
    ctx.newId,
    mailbox.map(m => m.id),
  )
  const next: Mail = { ...mail, id, order: ctx.number(MAIL_ORDER_SCOPE) }
  return {
    next,
    others: overLimit([...mailbox, { id, seen: false }]).map(id => ({ id, record: "removed" as const })),
  }
}

// 宛先の郵便（on の record）だけで行うアクションの引数
const NO_ARGS = z.strictObject({})

export const MAIL_SEND = kit.defineAction({
  id: "mail-send",
  aiDescription:
    "Send a letter to the user's mailbox (it shows at once on the user's screen, wherever the user is). from is a short name telling who sends it (use the same name all through your session, such as your task or work name). title (80 characters at most) and body (optional) are the letter. to points at a place: a book, and optionally a page of it and things (ids) on that page; the user can move there from the letter. The place is not checked now (if it is gone when the user opens the letter, the user is told). The mailbox keeps the newest 200 letters (seen ones go first). Returns the letter's id; read_mail tells later whether the user saw it and the place.",
  title: "Send mail",
  target: MAIL.id,
  reads: READS_MAILBOX_KEYS,
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
    return added && { next: added.next, others: added.others, result: { mail: added.next.id } }
  },
})

export const MAIL_SEEN = kit.defineAction({
  id: "mail-seen",
  aiDescription:
    "Done by the user's screen when the user opens the letter named by on.record (only the user). Refused if it was seen.",
  title: "Mark mail seen",
  target: MAIL.id,
  userOnly: true,
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
  run: now => (now === "none" ? null : { next: "removed" as const, result: {} }),
})
