// レーンの中のチケットの並べ方: 使う項目（on）を上から順に比べる（先の項目で同じなら次の項目で）。どれも使わなければ元の並び。
// 項目は 4 つ: id（番号の数）・優先度（PRIORITIES の順）・最終更新（時刻の文字。無ければ最も古い）・タグ（プロジェクトのチケットタグの並び順。タグなしと無いタグは最後）
import { PRIORITIES, PRIORITY_DEFAULT, type TicketRecord } from "./shown"

export const SORT_KEYS = ["id", "priority", "updated", "tag"] as const
export type SortKey = (typeof SORT_KEYS)[number]
export interface SortRule {
  key: SortKey
  desc: boolean
  on: boolean
}
export type SortRules = readonly SortRule[]

// 最初は id の降順だけを使う（新しいチケットが上）
export const DEFAULT_SORT: SortRules = SORT_KEYS.map(key => ({ key, desc: key === "id", on: key === "id" }))

export const sortActive = (rules: SortRules): boolean => rules.some(r => r.on)

// tagIds はプロジェクトのチケットタグの id を並びの順に
export function sortTickets(
  tickets: readonly TicketRecord[],
  rules: SortRules,
  tagIds: readonly string[],
): TicketRecord[] {
  const used = rules.filter(r => r.on)
  if (used.length === 0) return [...tickets]
  const value = (t: TicketRecord, key: SortKey): number | string => {
    if (key === "id") return t.number
    if (key === "priority") return PRIORITIES.indexOf(t.priority ?? PRIORITY_DEFAULT)
    if (key === "updated") return t.updatedAt
    const at = tagIds.indexOf(t.tag)
    return at < 0 ? tagIds.length : at
  }
  return [...tickets].sort((a, b) => {
    for (const r of used) {
      const x = value(a, r.key)
      const y = value(b, r.key)
      const order = x < y ? -1 : x > y ? 1 : 0
      if (order !== 0) return r.desc ? -order : order
    }
    return 0
  })
}
