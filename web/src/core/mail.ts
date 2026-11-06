// 郵便: 郵便箱（利用者に 1 つ）に届く知らせ。種類は core/def/mail.ts。届いた順に並びで持つ。
// 行き先 to（ブック・ページ・物の id）は任意で、送るときには確かめない（開くときに無ければ、無いと見せる）。
// 既読は 2 つ: 郵便そのものを見た時点 seenAt と、郵便が示した物（行き先）を見た時点 visitedAt
import { z } from "zod"
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

// 郵便箱のアクションの結果 after が形を守っているか: 前 before に無かった（変わった）郵便が、形に合い、種類が機能台帳にあって props がその形に合う
export function mailboxSettles(catalog: CoreCatalog, before: Mailbox, after: Mailbox): boolean {
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
