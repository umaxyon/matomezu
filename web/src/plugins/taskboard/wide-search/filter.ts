// チケットの絞り（横断検索のチケットモードが決め、タスクボードが従う。見た目でない。窓のプラグイン状態に持つ）:
// 言葉に当たったチケットの id の集合（言葉が無ければ null）と、プロジェクト・タグ・優先度・チケットボリュームの選び（空なら絞らない）
import type { WideSearchHit } from "../../../plugin-api"
import type { Ticket } from "../ticket"
import { ticketNumberOf } from "../ticket/label"

export interface TicketFilter {
  term: string // 入力の言葉（空なら言葉では絞らない）
  hits: readonly string[] | null // 言葉に当たったチケットの id（term が空のときは null）
  projects: readonly string[]
  tags: readonly string[]
  priorities: readonly string[]
  volumes: readonly string[]
}

// タグの選びの「タグなし」（タグを付けていないチケットに当たる）
export const NO_TAGS = "none"

export const NO_FILTER: TicketFilter = { term: "", hits: null, projects: [], tags: [], priorities: [], volumes: [] }

// 絞りが効いているか
export const isFiltering = (f: TicketFilter | undefined): f is TicketFilter =>
  f !== undefined &&
  (f.hits !== null || f.projects.length > 0 || f.tags.length > 0 || f.priorities.length > 0 || f.volumes.length > 0)

// 横断検索の当たりから、当たったチケットの id を取り出す（チケットの当たりは自分の id、チケット履歴の当たりは親のチケットの id）。重ならない
export function ticketIdsOf(hits: readonly WideSearchHit[], ticketKind: string): string[] {
  const ids = hits.flatMap(h => (h.kind === ticketKind ? [h.id] : h.of?.kind === ticketKind ? [h.of.id] : []))
  return [...new Set(ids)]
}

// 言葉のほかの選びが、選びの初めの状態（出しているプロジェクトだけで、タグ・優先度・ボリュームは選ばない）か
export const isInitialChoice = (f: TicketFilter, shownIds: readonly string[]): boolean =>
  f.tags.length === 0 &&
  f.priorities.length === 0 &&
  f.volumes.length === 0 &&
  f.projects.length === shownIds.length &&
  f.projects.every(id => shownIds.includes(id))

// 絞りに合うチケットだけを残す（絞りが無いか効いていなければ、そのまま）
export function filterTickets(tickets: readonly Ticket[], filter: TicketFilter | undefined): readonly Ticket[] {
  if (!isFiltering(filter)) return tickets
  const hits = filter.hits === null ? null : new Set(filter.hits)
  const has = (chosen: readonly string[], value: string) => chosen.length === 0 || chosen.includes(value)
  return tickets.filter(
    t =>
      (hits === null || hits.has(t.id)) &&
      has(filter.projects, t.project) &&
      hasTag(filter.tags, t.tags) &&
      has(filter.priorities, t.priority) &&
      has(filter.volumes, t.volume),
  )
}

// タグの選びに合うか（選びが空なら合う。付けたタグのどれかが選びに入っていれば合う。タグなしの選びは、タグを付けていないチケットに合う）
const hasTag = (chosen: readonly string[], tags: readonly string[]) =>
  chosen.length === 0 || (tags.length === 0 ? chosen.includes(NO_TAGS) : tags.some(tag => chosen.includes(tag)))

// 選びの入り切り
export const toggled = (chosen: readonly string[], value: string): readonly string[] =>
  chosen.includes(value) ? chosen.filter(v => v !== value) : [...chosen, value]

// 入力を空白で分けた語（どれかに当たれば横断検索の当たり）。数字で終わる語（M-0050・0050 など）は、その番号（50）も一緒に探す（元の語は残す）
export function searchTerms(input: string): string[] {
  const words = input.split(/\s+/).filter(w => w !== "")
  const numbers = words.flatMap(w => ticketNumberOf(w) ?? [])
  return [...new Set([...words, ...numbers])]
}
