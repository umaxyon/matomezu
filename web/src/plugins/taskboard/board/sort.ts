// レーンの中のチケットの並べ方: 使う項目（on）を上から順に比べる（先の項目で同じなら次の項目で）。どれも使わなければ元の並び。
// 項目は 5 つ: id（番号の数）・優先度（PRIORITIES の順）・チケットボリューム（VOLUMES の順。見積もっていない none がいちばん小さい）・最終更新（時刻の文字。無ければ最も古い）・タグ（プロジェクトのチケットタグの並び順。タグなしと無いタグは最後）
import type { Ticket } from "../ticket"
import { PRIORITIES, PRIORITY_DEFAULT, VOLUMES } from "./shown"

export const SORT_KEYS = ["id", "priority", "volume", "updated", "tag"] as const
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

// tagIds はプロジェクトのチケットタグの id を並びの順に。タグで並べるときは、付いたタグをプロジェクトの順に並べて 1 つ目から順に比べ、
// 同じなら 2 つ目と比べる（前が同じで短い方が先）。タグの無いチケットは後ろ
export function sortTickets(tickets: readonly Ticket[], rules: SortRules, tagIds: readonly string[]): Ticket[] {
  const used = rules.filter(r => r.on)
  if (used.length === 0) return [...tickets]
  const value = (t: Ticket, key: SortKey): readonly (number | string)[] => {
    if (key === "id") return [t.number]
    if (key === "priority") return [PRIORITIES.indexOf(t.priority ?? PRIORITY_DEFAULT)]
    if (key === "volume") return [VOLUMES.indexOf(t.volume)]
    if (key === "updated") return [t.updatedAt]
    const at = t.tags
      .map(id => tagIds.indexOf(id))
      .filter(i => i >= 0)
      .sort((x, y) => x - y)
    return at.length > 0 ? at : [tagIds.length]
  }
  return [...tickets].sort((a, b) => {
    for (const r of used) {
      const order = compareLists(value(a, r.key), value(b, r.key))
      if (order !== 0) return r.desc ? -order : order
    }
    return 0
  })
}

// 値の並びを 1 つ目から順に比べる（前が同じなら短い方が先）
function compareLists(x: readonly (number | string)[], y: readonly (number | string)[]): number {
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const a = x[i] as number | string
    const b = y[i] as number | string
    if (a !== b) return a < b ? -1 : 1
  }
  return x.length - y.length
}
