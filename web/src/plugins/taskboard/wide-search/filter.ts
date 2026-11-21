// チケットの絞り（横断検索のチケットモードが決め、タスクボードが従う。見た目でない。窓のプラグイン状態に持つ）:
// 言葉に当たったチケットの id の集合（言葉が無ければ null）と、プロジェクト・タグ・優先度・チケットボリュームの選び（空なら絞らない）
import type { WideSearchHit } from "../../../plugin-api"
import { type Project, prefixKey } from "../project"
import type { Ticket } from "../ticket"
import { ticketLabelParts } from "../ticket/label"

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

// 入力を空白で分けた語（どれかに当たれば横断検索の当たり。重ならない）
export function searchTerms(input: string): string[] {
  return [...new Set(input.split(/\s+/).filter(w => w !== ""))]
}

// 語のどれかが番号の見せ方（M-0050・0050 など）として指すチケットの id。番号はぴったり同じ物だけで、頭があればそのプロジェクトのプレフィクスとも合う物（大文字小文字は見ない）。
// 番号は本文の字としては探さない（23 で「手順23」に当てない）
export function numberedTicketIds(
  terms: readonly string[],
  tickets: readonly Ticket[],
  projects: readonly Pick<Project, "id" | "prefix">[],
): string[] {
  const prefixOf = (id: string) => projects.find(p => p.id === id)?.prefix ?? ""
  const wanted = terms.flatMap(w => ticketLabelParts(w) ?? [])
  return tickets
    .filter(t =>
      wanted.some(
        w => w.number === t.number && (w.prefix === "" || prefixKey(w.prefix) === prefixKey(prefixOf(t.project))),
      ),
    )
    .map(t => t.id)
}

// 言葉に当たったチケットの id: 横断検索の当たり found に、番号の見せ方の語が指すチケットを足す（重ならない）
export const ticketHits = (
  found: readonly string[],
  terms: readonly string[],
  tickets: readonly Ticket[],
  projects: readonly Pick<Project, "id" | "prefix">[],
): string[] => [...new Set([...found, ...numberedTicketIds(terms, tickets, projects)])]
