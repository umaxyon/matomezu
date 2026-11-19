// 横断検索をホストに頼む形（GET /api/search）: 頼みを URL の問い合わせ文字列にし、答えを確かめる
import { z } from "zod"
import type { WideSearchAnswer, WideSearchHit, WideSearchQuery } from "../core/wide-search"

const WIDE_SEARCH_HIT = z.object({
  kind: z.string(),
  id: z.string(),
  part: z.string(),
  brief: z.string(),
  snippet: z.string(),
  label: z.string().optional(),
  of: z.object({ kind: z.string(), id: z.string() }).optional(),
}) satisfies z.ZodType<WideSearchHit>

export const WIDE_SEARCH_ANSWER = z.object({
  total: z.number().int(),
  hits: z.array(WIDE_SEARCH_HIT),
  more: z.number().int().optional(),
  next: z.number().int().optional(),
}) satisfies z.ZodType<WideSearchAnswer>

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
