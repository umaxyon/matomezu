// 郵便: 利用者に届く知らせ。種類は core/def/mail.ts。郵便 1 通は、base の対象の定義 mail（index.ts）のレコード 1 件で、
// 届いた順は番号 order で決まる（番号を振る種類。使い回さない）。郵便の形（MailSchema）と確かめ（checkMail）は、ここが持つ（core は郵便を知らない）。
// 行き先 to（ブック・ページ・物の id）は任意で、送るときには確かめない（開くときに無ければ、無いと見せる）。
// 既読は 2 つ: 郵便そのものを見た時点 seenAt と、郵便が示した物（行き先）を見た時点 visitedAt
import { z } from "zod"
import type { Actor } from "../../../core/actor"
import type { CoreCatalog } from "../../../core/core-catalog"
import { splitId } from "../../../core/names"
import { type Warning, warning } from "../../../core/warnings"
import { BIRD_IDS } from "../birds"
import { BIRD_PALETTE_IDS } from "../birds/colors"

// 郵便の送り手の種類: 行った者の種類（core/actor.ts）と同じ値
const SENDER_KINDS = ["ai", "user"] as const satisfies readonly Actor["kind"][]

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
  order: z.number().int().min(1), // 届いた順の番号（AI には見せない）
  sender: z
    .object({
      participant: z.string().min(1),
      bird: z.enum(BIRD_IDS),
      palette: z.enum(BIRD_PALETTE_IDS).optional(),
    })
    .optional(), // 送信時に参加済みだった送り手と、その時の鳥と配色
  senderKind: z.enum(SENDER_KINDS), // 送り手が AI か利用者か（送るアクションを行った者の種類）
})
export type Mail = z.output<typeof MailSchema>
export type MailSenderKind = Mail["senderKind"]

// 郵便を送るアクション（mail-send・proposal-send）の本文の上限。長い事はブックのページに書き、郵便はそこを案内する。
// 郵便の種類の props は 4000 のまま（残した郵便を確かめるのは props なので、上限を下げても今ある郵便は効かなくならない）
export const SENT_BODY_MAX = 300

// 番号を振る区切りの名前（郵便は利用者に 1 つの並びなので、区切りは 1 つ）
export const MAIL_ORDER_SCOPE = "mail"

// 郵便 1 通の効かない所（種類が機能台帳に無い W022・形が合わない W023）の warning。データには手を付けない（画面は題を「郵便」として出す）。
// 対象の定義 mail の check に書き、アクションの結果の確かめ（core/perform-checks.ts）と、残したレコードの確かめ（core/records.ts の checkRecords）が呼ぶ
export function checkMail(catalog: CoreCatalog, record: unknown): Warning[] {
  const m = (typeof record === "object" && record !== null ? record : {}) as Partial<Record<keyof Mail, unknown>>
  const kind = typeof m.mail === "string" ? m.mail : ""
  const owner = splitId(kind).owner ?? ""
  const def = catalog.mails.get(kind)
  if (!def) return [warning("W022", owner, { id: String(m.id), mail: kind })]
  return MailSchema.safeParse(m).success && def.props.safeParse(m.props).success
    ? []
    : [warning("W023", owner, { id: String(m.id), mail: kind })]
}

// 郵便のレコードを、届いた順（order の小さい順）に並べる。中の 1 通ずつは確かめずに持ち、order が数でない郵便はいちばん古い所に置く（同じ順は id の順）
export function mailsInOrder(records: readonly unknown[]): readonly Mail[] {
  const key = (m: unknown) => {
    const order = (m as { order?: unknown } | null)?.order
    return typeof order === "number" ? order : 0
  }
  const id = (m: unknown) => String((m as { id?: unknown } | null)?.id ?? "")
  return [...records].sort((a, b) => key(a) - key(b) || (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0)) as Mail[]
}
