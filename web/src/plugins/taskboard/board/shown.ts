// タスクボードの見せ方の決め事（見た目でない。レコードから、画面に出す物を決める）: 一覧の並びと出すタスクボード・タスクボードのレーン・レーンのチケット・タグ。
// 消した物を指しているチケットは書き換えず、ここで読み替える（無いレーンは未分類、無いタグは外す）。閉じたプロジェクトは出さない
import type { RecordOf } from "../../../plugin-api"
import type { WORKROOM_SUBJECT } from "../by"
import { type CardSize, INHERIT_CARD_SIZE, type Project, UNSORTED } from "../project"
import { PRIORITIES, PRIORITY_DEFAULT, type Ticket, VOLUMES } from "../ticket"

export { PRIORITIES, PRIORITY_DEFAULT, VOLUMES }
export type WorkroomRecord = RecordOf<typeof WORKROOM_SUBJECT>
export type TagRecord = Project["tags"][number]

// 一覧の並び: 利用者の並び order にあるプロジェクトをその順に、並びに無い物（新しい物）は後ろに名前の順。閉じた物は出さない
export function orderedProjects(projects: readonly Project[], order: readonly string[]): Project[] {
  const open = projects.filter(p => !p.closed)
  const listed = order.flatMap(id => open.filter(p => p.id === id))
  const rest = open.filter(p => !order.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...listed, ...rest]
}

// 出しているタスクボード: 利用者の設定の値 shown（無ければ、まだ選んでいないので並びの最初の 1 枚。空の並びは何も出さない）の中の、並び ordered にある物を、並びの順に
export function shownProjects(ordered: readonly Project[], shown: readonly string[] | undefined): Project[] {
  if (shown === undefined) return ordered.slice(0, 1)
  return ordered.filter(p => shown.includes(p.id))
}

// タスクボードに出すレーン（設定の並びのとおり。未分類は「未分類を表示する」がオンのときだけ）
export interface LaneInfo {
  id: string // レーンの id（未分類は UNSORTED）
  name: string | null // レーンの名前（未分類は null で、画面が文言を出す）
}

export function lanesOf(project: Project): LaneInfo[] {
  return project.lanes.flatMap((l): LaneInfo[] =>
    l.kind === "lane" ? [{ id: l.id, name: l.name }] : l.shown ? [{ id: UNSORTED, name: null }] : [],
  )
}

// プロジェクトのチケットを、レーンの id ごとに分ける（レーンの並びに無いレーンのチケットは未分類。未分類が出ていなければ、その分は出ない）
export function ticketsByLane(tickets: readonly Ticket[], project: Project): Readonly<Record<string, Ticket[]>> {
  const laneIds = new Set(project.lanes.flatMap(l => (l.kind === "lane" ? [l.id] : [])))
  const out: Record<string, Ticket[]> = {}
  for (const t of tickets) {
    if (t.project !== project.id) continue
    const lane = laneIds.has(t.lane) ? t.lane : UNSORTED
    out[lane] = [...(out[lane] ?? []), t]
  }
  return out
}

// レーン lane（レーンの id か未分類）のチケットカードの大きさ: レーンの cardSize が inherit か、未分類・無いレーンなら、プロジェクトの cardSize
export function cardSizeOf(project: Project, lane: string): CardSize {
  const row = project.lanes.find(l => l.kind === "lane" && l.id === lane)
  return row?.kind === "lane" && row.cardSize !== INHERIT_CARD_SIZE ? row.cardSize : project.cardSize
}
