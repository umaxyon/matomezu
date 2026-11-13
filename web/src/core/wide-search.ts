// 横断検索: 画面がホストに頼む検索（GET /api/search）の頼み方と答えの形。
// 探す仕組みはホストの 1 か所で、画面はその答えをそのまま使う
import { z } from "zod"

// 載せない物（一覧の既定の目次に載せない物）の扱い: hide は除く・include は含める・only は載せない物だけ
export type WideSearchUnlisted = "hide" | "include" | "only"

export interface WideSearchQuery {
  terms: readonly string[] // 言葉（どれかに当たれば横断検索の当たり）
  kinds?: readonly string[] // 探す種類の id（無ければ探せる種類の全部）
  limit?: number
  offset?: number
  unlisted?: WideSearchUnlisted // 画面の口の既定は include
}

export const WIDE_SEARCH_HIT = z.object({
  kind: z.string(),
  id: z.string(),
  part: z.string(),
  brief: z.string(),
  snippet: z.string(),
  label: z.string().optional(), // 何に当たったかの名前（そのレコードの searchTexts の title。無ければ親の title。どちらも無ければ省く）
  of: z.object({ kind: z.string(), id: z.string() }).optional(), // 当たったレコードの親
})
export type WideSearchHit = z.output<typeof WIDE_SEARCH_HIT>

export const WIDE_SEARCH_ANSWER = z.object({
  total: z.number().int(),
  hits: z.array(WIDE_SEARCH_HIT),
  more: z.number().int().optional(), // 上限で切れた、残りの数
  next: z.number().int().optional(), // 続きの offset
})
export type WideSearchAnswer = z.output<typeof WIDE_SEARCH_ANSWER>

export const NO_WIDE_SEARCH_HITS: WideSearchAnswer = { total: 0, hits: [] }

// 頼みを URL の問い合わせ文字列にする
export function wideSearchParams(q: WideSearchQuery): URLSearchParams {
  const p = new URLSearchParams()
  for (const term of q.terms) p.append("term", term)
  if (q.kinds && q.kinds.length > 0) p.set("kinds", JSON.stringify(q.kinds.map(kind => ({ kind }))))
  if (q.limit !== undefined) p.set("limit", String(q.limit))
  if (q.offset !== undefined) p.set("offset", String(q.offset))
  if (q.unlisted !== undefined) p.set("unlisted", q.unlisted)
  return p
}
