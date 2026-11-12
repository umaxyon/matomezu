// タスクボードの見せ方の決め事（見た目でない。レコードから、画面に出す物を決める）: 一覧の並びと出すボード・ボードのレーン・レーンのチケット・タグ・担当・ワークルームの今のチケット。
// 消した物を指しているチケットは書き換えず、ここで読み替える（無いレーンは未分類、無いタグはタグなし、無いワークルームは担当から外す）。閉じたプロジェクトは出さない
import type { z } from "zod"
import type { RecordOf } from "../../plugin-api"
import type { CURRENT } from "./current"
import { NO_TICKET } from "./current"
import type { HISTORY } from "./history"
import { NO_TAG, type PROJECT, UNSORTED } from "./project"
import { PRIORITIES, PRIORITY_DEFAULT, type TICKET } from "./ticket"

export { PRIORITIES, PRIORITY_DEFAULT }
export type ProjectRecord = z.output<typeof PROJECT.record>
export type TicketRecord = z.output<typeof TICKET.record>
export type HistoryRecord = z.output<typeof HISTORY.record>
export type CurrentRecord = z.output<typeof CURRENT.record>
export type WorkroomRecord = RecordOf<"@matomezu/base:workroom">
export type TagRecord = ProjectRecord["tags"][number]

// 一覧の並び: 利用者の並び order にあるプロジェクトをその順に、並びに無い物（新しい物）は後ろに名前の順。閉じた物は出さない
export function orderedProjects(projects: readonly ProjectRecord[], order: readonly string[]): ProjectRecord[] {
  const open = projects.filter(p => !p.closed)
  const listed = order.flatMap(id => open.filter(p => p.id === id))
  const rest = open.filter(p => !order.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...listed, ...rest]
}

// 出しているボード: 利用者の設定の値 shown（無ければ、まだ選んでいないので並びの最初の 1 枚。空の並びは何も出さない）の中の、並び ordered にある物を、並びの順に
export function shownProjects(
  ordered: readonly ProjectRecord[],
  shown: readonly string[] | undefined,
): ProjectRecord[] {
  if (shown === undefined) return ordered.slice(0, 1)
  return ordered.filter(p => shown.includes(p.id))
}

// ボードに出すレーン（設定の並びのとおり。未分類は「未分類を表示する」がオンのときだけ）
export interface LaneInfo {
  id: string // レーンの id（未分類は UNSORTED）
  name: string | null // レーンの名前（未分類は null で、画面が文言を出す）
}

export function lanesOf(project: ProjectRecord): LaneInfo[] {
  return project.lanes.flatMap((l): LaneInfo[] =>
    l.kind === "lane" ? [{ id: l.id, name: l.name }] : l.shown ? [{ id: UNSORTED, name: null }] : [],
  )
}

// プロジェクトのチケットを、レーンの id ごとに分ける（レーンの並びに無いレーンのチケットは未分類。未分類が出ていなければ、その分は出ない）
export function ticketsByLane(
  tickets: readonly TicketRecord[],
  project: ProjectRecord,
): Readonly<Record<string, TicketRecord[]>> {
  const laneIds = new Set(project.lanes.flatMap(l => (l.kind === "lane" ? [l.id] : [])))
  const out: Record<string, TicketRecord[]> = {}
  for (const t of tickets) {
    if (t.project !== project.id) continue
    const lane = laneIds.has(t.lane) ? t.lane : UNSORTED
    out[lane] = [...(out[lane] ?? []), t]
  }
  return out
}

// チケットのタグ（タグなし・無いタグは undefined）
export const tagOf = (project: ProjectRecord, ticket: TicketRecord): TagRecord | undefined =>
  ticket.tag === NO_TAG ? undefined : project.tags.find(t => t.id === ticket.tag)

// チケットの担当のワークルームの id（無いワークルームは外す。順序は書いたとおり）
export const assigneesOf = (ticket: TicketRecord, workrooms: readonly string[]): string[] =>
  ticket.assignees.filter(id => workrooms.includes(id))

// ワークルームの今のチケット（宣言が無い・none・チケットかプロジェクトが無ければ undefined）と、そのチケットの最新のチケット履歴
export interface CurrentTask {
  ticket: TicketRecord
  project: ProjectRecord
  latest: HistoryRecord | undefined
}

export function currentTaskOf(
  workroom: string,
  currents: readonly CurrentRecord[],
  tickets: readonly TicketRecord[],
  projects: readonly ProjectRecord[],
  entries: readonly HistoryRecord[],
): CurrentTask | undefined {
  const current = currents.find(c => c.id === workroom)
  if (!current || current.ticket === NO_TICKET) return undefined
  const ticket = tickets.find(t => t.id === current.ticket)
  const project = ticket && projects.find(p => p.id === ticket.project)
  if (!ticket || !project) return undefined
  return { ticket, project, latest: newestFirst(entries.filter(h => h.ticket === ticket.id))[0] }
}

// チケット履歴を新しい順に（同じ時刻なら id の降順）
export const newestFirst = (entries: readonly HistoryRecord[]): HistoryRecord[] =>
  [...entries].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
