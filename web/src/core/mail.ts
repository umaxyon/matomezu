// 郵便: 郵便箱（利用者に 1 つ）に届く知らせ。種類は core/def/mail.ts。届いた順に並びで持つ。郵便は 1 つのプロジェクトに属する。
// 行き先 to（ブック・ページ・物の id）は任意で、送るときには確かめない（開くときに無ければ、無いと見せる）。
// 既読は 2 つ: 郵便そのものを見た時点 seenAt と、郵便が示した物（行き先）を見た時点 visitedAt
import { z } from "zod"
import { briefLine } from "./brief"
import type { CoreCatalog } from "./core-catalog"
import { splitId } from "./names"
import { type Warning, warning } from "./warnings"

export const MailSchema = z.object({
  id: z.string().min(1),
  mail: z.string().min(1), // 種類の id
  from: z.string(), // 送り手の名前（AI が付けた、セッションを見分ける名前など）
  sentAt: z.string(), // 届いた時点
  to: z
    .object({
      book: z.string().min(1),
      page: z.string().min(1).optional(),
      ids: z.array(z.string().min(1)).min(1).optional(), // ページの中の物（見せる物）
    })
    .optional(),
  seenAt: z.string().optional(), // 利用者が郵便を見た時点（無ければ未読）
  visitedAt: z.string().optional(), // 利用者が行き先を見た時点（無ければまだ）
  props: z.unknown(), // 種類ごとの形（種類の props で確かめる）
})
export type Mail = z.output<typeof MailSchema>

// 郵便箱: 郵便の並び（届いた順）
export type Mailbox = readonly Mail[]

// 残しておいた郵便箱（外から来る値。並びでなければ空とし、中の 1 つずつは確かめずに持つ）
export const restoreMailbox = (saved: unknown): Mailbox => (Array.isArray(saved) ? (saved as Mail[]) : [])

// 郵便箱のアクションの結果 after が形を守っているか: id が重ならず、前 before に無かった（変わった）郵便が、形に合い、種類が機能台帳にあって props がその形に合う
export function mailboxSettles(catalog: CoreCatalog, before: Mailbox, after: Mailbox): boolean {
  if (new Set(after.map(m => m.id)).size !== after.length) return false
  const kept = new Set(before)
  return after.every(m => {
    if (kept.has(m)) return true
    if (!MailSchema.safeParse(m).success) return false
    const def = catalog.mails.get(m.mail)
    return !!def && def.props.safeParse(m.props).success
  })
}

// 郵便箱の効かない郵便（種類が機能台帳に無い W022・形が合わない W023）の warning。データには手を付けない（画面は題を「郵便」として出す）
export function checkMailbox(catalog: CoreCatalog, mailbox: Mailbox): Warning[] {
  return mailbox.flatMap(m => {
    const kind = typeof m.mail === "string" ? m.mail : ""
    const owner = splitId(kind).owner ?? ""
    const def = catalog.mails.get(kind)
    if (!def) return [warning("W022", owner, { id: String(m.id), mail: kind })]
    return MailSchema.safeParse(m).success && def.props.safeParse(m.props).success
      ? []
      : [warning("W023", owner, { id: String(m.id), mail: kind })]
  })
}

// AI が郵便を読むときの取り方（read_mail の引数。値は外から来た文字のまま持ち、mailForAi が確かめる）
export interface MailQuery {
  ids?: readonly string[] // 指定した郵便の全文
  limit?: string // 一覧に返す通数（1 以上 MAIL_LIST_MAX 以下の整数。無ければ MAIL_LIST_DEFAULT）
  before?: string // この郵便より古い分（その郵便は含まない）
  unseen?: string // "1" なら、利用者がまだ開いていない郵便だけ
  unvisited?: string // "1" なら、行き先があって、利用者がまだ見ていない郵便だけ
}

const MAIL_LIST_DEFAULT = 20 // 一覧に返す通数の既定
const MAIL_LIST_MAX = 100 // 一覧に返す通数の上限
const MAIL_IDS_MAX = 20 // 全文を 1 回に取れる通数の上限（変更提案の本文は大きい）
const MAIL_TITLE_LIMIT = 80 // 一覧の題の長さの上限（字）

// AI に見せる郵便の一覧の 1 行: 郵便から中身（props）を外し、種類の aiBrief が答えた 1 行を title に付ける（種類が台帳に無い・形が合わない・aiBrief が無い・空なら付けない）
export type MailRow = Omit<Mail, "props"> & { title?: string }

export type MailForAi =
  | { ok: true; answer: { mailbox: MailRow[]; total: number; older: number } | { mailbox: Mail[]; unknown?: string[] } }
  | { ok: false; reason: string } // 断る理由（AI に返す英語の文）

// 郵便箱 mailbox を、query の取り方で AI に見せる。
// 一覧（ids が無いとき）は新しい順で、{mailbox: 行の並び, total, older}: total は絞り（unseen・unvisited）に合う全部の数、
// older は返した中で一番古い郵便より古い、絞りに合う数（続きは、返した一番古い郵便の id を before に渡して取る）。before の位置は、unseen・unvisited で絞る前の箱で数える。
// ids のときは、その郵便の全文（箱の新しい順。重なりは 1 つ）と、箱に無い id（unknown。あるときだけ）。ids はほかの取り方と一緒には渡せない
export function mailForAi(catalog: CoreCatalog, mailbox: Mailbox, query: MailQuery): MailForAi {
  if (query.ids !== undefined) {
    if (
      query.limit !== undefined ||
      query.before !== undefined ||
      query.unseen !== undefined ||
      query.unvisited !== undefined
    ) {
      return { ok: false, reason: "ids cannot be given together with limit, before, unseen or unvisited" }
    }
    if (query.ids.length === 0 || query.ids.length > MAIL_IDS_MAX) {
      return { ok: false, reason: `ids takes 1 to ${MAIL_IDS_MAX} ids of letters` }
    }
    const wanted = new Set(query.ids)
    const found = mailbox.filter(m => wanted.has(m.id)).reverse()
    const unknown = [...wanted].filter(id => !found.some(m => m.id === id)).sort()
    return { ok: true, answer: unknown.length > 0 ? { mailbox: found, unknown } : { mailbox: found } }
  }
  let limit = MAIL_LIST_DEFAULT
  if (query.limit !== undefined) {
    limit = /^\d+$/.test(query.limit) ? Number(query.limit) : 0
    if (limit < 1 || limit > MAIL_LIST_MAX) {
      return { ok: false, reason: `limit is an integer from 1 to ${MAIL_LIST_MAX}` }
    }
  }
  let older = mailbox
  if (query.before !== undefined) {
    const at = mailbox.findIndex(m => m.id === query.before)
    if (at < 0) {
      return {
        ok: false,
        reason: `no such letter to go back from: ${query.before} (before takes the id of a letter in the mailbox)`,
      }
    }
    older = mailbox.slice(0, at)
  }
  const keep = (m: Mail) =>
    (query.unseen !== "1" || m.seenAt === undefined) &&
    (query.unvisited !== "1" || (m.to !== undefined && m.visitedAt === undefined))
  const total = mailbox.filter(keep).length
  const matching = older.filter(keep)
  const shown = matching.slice(-limit).reverse()
  const rows = shown.map(({ props, ...head }): MailRow => {
    const def = catalog.mails.get(head.mail)
    if (def?.aiBrief === undefined || !def.props.safeParse(props).success) return head
    const title = briefLine(def.aiBrief(props), MAIL_TITLE_LIMIT)
    return title === "" ? head : { ...head, title }
  })
  return { ok: true, answer: { mailbox: rows, total, older: matching.length - rows.length } }
}
