// 郵便箱: 郵便のレコードの種類（対象の定義 mail）と、郵便を 1 通足すアクションが使う処理（上限を守って古い郵便を消す）
import { type Actor, workroomOfActor } from "../../../core/actor"
import type { ActionContext, AIEditTicketChange, RecordRead } from "../../../core/def/action"
import { inOrder } from "../../../core/record-keys"
import { NO_RECORD, RECORDS_MAX, type Records } from "../../../core/records"
import { kit } from "../kit"
import { PARTICIPANT, readsParticipantsIn, WORKROOM } from "../participant"
import { freshId } from "../utils/ids"
import { keyRowsIn } from "../utils/key-rows"
import { checkMail, MAIL_ORDER_SCOPE, type Mail, MailSchema, mailsInOrder } from "./mail"
import { ticketsOnRemoved } from "./removed"

// 郵便のレコードの種類。AI は read_records で読む: 一覧は新しい順に 20 通（題と、種類・送り手・届いた時点・行き先・既読の 2 つ）、中身（props）は id を指して読む
export const MAIL = kit.defineSubject({
  id: "mail",
  title: "Mail",
  aiDescription:
    "A letter in the user's mailbox (send one with mail-send). Listed newest first: mail (the kind of letter), from, sentAt, to (the place it points at), seenAt (when the user opened the letter; left out: not yet), visitedAt (when the user saw the place it points at; left out: not yet) and brief (a line that tells the letter apart). Its props (title and body, and more for some kinds) come with id or ids. Index keys: seenAt (where {seenAt: {is: absent}} lists the letters the user has not opened yet), visitedAt, to (the id of the book it points at; {to: {is: present}, visitedAt: {is: absent}} lists the letters whose place the user has not seen yet) and order (the number it arrived as).",
  numbered: true,
  record: MailSchema,
  // 郵便の種類が機能台帳にあり、その形にも合うか
  check: (record, catalog) => checkMail(catalog, record),
  // 届いた順の番号、利用者が見た時点（見ていなければ無い）、行き先を見た時点（見ていなければ無い）、行き先のブックの id（行き先が無ければ無い）
  keys: {
    order: { type: "number", of: m => m.order },
    seenAt: { type: "text", of: m => m.seenAt },
    visitedAt: { type: "text", of: m => m.visitedAt },
    to: { type: "text", of: m => m.to?.book },
  },
  aiList: { order: { key: "order", dir: "desc" }, limit: 20 },
  // 一覧の題は、郵便の種類が答えた 1 行（種類が機能台帳に無い・形が合わない・答えなければ無し）
  aiBrief: (m, ctx) => {
    const def = ctx.catalog.mails.get(m.mail)
    return def?.aiBrief !== undefined && def.props.safeParse(m.props).success ? def.aiBrief(m.props) : ""
  },
  aiRow: m => ({
    mail: m.mail,
    from: m.from,
    sentAt: m.sentAt,
    ...(m.to ? { to: m.to } : {}),
    ...(m.seenAt ? { seenAt: m.seenAt } : {}),
    ...(m.visitedAt ? { visitedAt: m.visitedAt } : {}),
  }),
})

// 郵便を 1 通足すアクションが読む物: 今ある郵便全部の、索引キーだけ（上限で消す古い郵便と、重ならない id を決めるのに使う。本文は読まない）
export const READS_MAILBOX_KEYS = () => [{ subject: MAIL.id, where: [], keysOnly: true as const }]

// 参加済みの AI から送るときは、送り手と鳥の配色をワークルームから引く
export function readsMailSender(actor: Actor): readonly RecordRead[] {
  const mailbox = READS_MAILBOX_KEYS()
  const roomId = workroomOfActor(actor)
  if (roomId === undefined) return mailbox
  return [...mailbox, readsParticipantsIn(roomId), { subject: WORKROOM.id, id: roomId }]
}

function mailSender(ctx: ActionContext): Mail["sender"] {
  const roomId = workroomOfActor(ctx.actor)
  if (roomId === undefined) return undefined
  const participants = keyRowsIn(ctx, PARTICIPANT.id).filter(
    ({ keys }) => keys.workroom === roomId && keys.state === "joined",
  )
  const room = WORKROOM.record.safeParse(ctx.records?.[WORKROOM.id]?.[roomId])
  const participant = participants[0]?.id
  if (!participant || participants.length !== 1 || !room.success) return undefined
  const { bird, palette } = room.data
  return { participant, bird, ...(palette ? { palette } : {}) }
}

// 郵便箱の 1 通の、索引キーから分かる所（届いた順に並べた物）
interface MailKeys {
  id: string
  seen: boolean
}

// 郵便のレコードを届いた順に並べた郵便箱（画面のフックが読む）
export const mailboxOf = (records: Records): readonly Mail[] => mailsInOrder(Object.values(records[MAIL.id] ?? {}))

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

// 郵便を 1 通足すアクション（mail-send・proposal-send）が返す物: 足す郵便（id と届いた順の番号を振る）と、上限を守るために消す古い郵便と、
// 消す郵便の種類が答えた AI 編集チケットの変え方（removed.ts。足す郵便のアクションが返す aiEditTickets に入れる）。
// 今ある郵便は、索引キーだけを ctx.keys から読み（アクションの reads に READS_MAILBOX_KEYS を書く）、消す郵便だけ中身を ctx.record で読む。番号を受け取れなければ null
export function mailAdded(
  ctx: ActionContext,
  mail: Omit<Mail, "id" | "order" | "sender">,
): {
  next: Mail
  others: readonly { id: string; record: "removed" }[]
  aiEditTickets: readonly AIEditTicketChange[]
} | null {
  if (!ctx.number) return null
  const mailbox: MailKeys[] = inOrder(keyRowsIn(ctx, MAIL.id), { key: "order", dir: "asc" }).map(m => ({
    id: m.id,
    seen: m.keys.seenAt !== undefined,
  }))
  const id = freshId(
    ctx.newId,
    mailbox.map(m => m.id),
  )
  const sender = mailSender(ctx)
  const next: Mail = { ...mail, id, order: ctx.number(MAIL_ORDER_SCOPE), ...(sender ? { sender } : {}) }
  const dropped = overLimit([...mailbox, { id, seen: false }])
  const gone = dropped.flatMap(id => {
    const mail = ctx.record?.(MAIL.id, id)
    return mail === undefined || mail === NO_RECORD ? [] : [mail as Mail]
  })
  return {
    next,
    others: dropped.map(id => ({ id, record: "removed" as const })),
    aiEditTickets: ticketsOnRemoved(ctx.catalog, gone, "limit"),
  }
}
