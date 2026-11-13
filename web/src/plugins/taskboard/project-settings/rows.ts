// プロジェクト設定の一覧（レーン・チケットタグ）の行を、ダイアログの中で足す・直す・名前の入力Formを離れたときに片付ける・並べ替える純関数と、
// 行からプロジェクトを直すアクションの引数を作る関数。
// 行は画面の中だけの鍵 key と、データの id（もうある行だけ。無い行は保存で新しく入る）を分けて持つ。もうある行は、開いたときの名前 was も持つ
import type { z } from "zod"
import { DONE_LANE_CARD_SIZE, type LANE, NO_DONE_LANE, type PROJECT, repeatedAt, type TAG, UNSORTED } from "../project"
import { moved } from "../reorder/order"

type Project = z.output<typeof PROJECT.record>
type Lane = z.output<typeof LANE>
type Tag = z.output<typeof TAG>

export interface NamedRow {
  key: string
  id?: string // データの id（無ければ保存で新しく入る）
  was?: string // 開いたときの名前（もうある行だけ）
  name: string
}
export type LaneRow =
  | (NamedRow & { kind: "lane"; prompt: string; cardSize: LaneCardSize })
  | { key: string; kind: "unsorted"; shown: boolean }
type LaneCardSize = Lane["cardSize"]
export type TagRow = NamedRow & Omit<Tag, "id" | "name">

export const UNSORTED_KEY = UNSORTED // 未分類の行の鍵（どの行の鍵とも重ならない）

// プロジェクトのレーンの並びを、行にする（未分類の行も並びの位置のまま入る）
export const laneRowsOf = (project: Project): LaneRow[] =>
  project.lanes.map(l =>
    l.kind === "lane"
      ? { key: l.id, id: l.id, was: l.name, kind: "lane", name: l.name, prompt: l.prompt, cardSize: l.cardSize }
      : { key: UNSORTED_KEY, kind: "unsorted", shown: l.shown },
  )

export const tagRowsOf = (project: Project): TagRow[] =>
  project.tags.map(({ id, ...t }) => ({ ...t, key: id, id, was: t.name }))

// 名前を持つ行（未分類の行を除く）
const named = <R extends LaneRow | TagRow>(rows: readonly R[]) =>
  rows.filter((r): r is Extract<R, NamedRow> => !("kind" in r && r.kind === "unsorted"))

// 名前が、ほかの行と重なっている行の鍵
export function repeatedKeys(rows: readonly (LaneRow | TagRow)[]): ReadonlySet<string> {
  const list = named(rows)
  const at = repeatedAt(list.map(r => r.name))
  return new Set(list.filter((_, i) => at.has(i)).map(r => r.key))
}

export function changeRow<R extends { key: string }>(rows: readonly R[], key: string, patch: Partial<R>): R[] {
  return rows.map(r => (r.key === key ? { ...r, ...patch } : r))
}

// 名前の入力Formを離れた行 key を片付ける: 名前が空なら消す。ほかの行と名前が重なっていれば、新しい行は消し、もうある行は開いたときの名前に戻す
export function leaveRow<R extends LaneRow | TagRow>(rows: readonly R[], key: string): R[] {
  const row = named(rows).find(r => r.key === key)
  if (!row) return [...rows]
  if (row.name.trim() === "") return rows.filter(r => r.key !== key)
  if (!repeatedKeys(rows).has(key)) return [...rows]
  return row.was === undefined
    ? rows.filter(r => r.key !== key)
    : rows.map(r => (r.key === key ? { ...r, name: row.was } : r))
}

// 行 dragging を行 over の位置へ動かす
export function moveRow<R extends { key: string }>(rows: readonly R[], dragging: string, over: string): R[] {
  const a = rows.find(r => r.key === dragging)
  const b = rows.find(r => r.key === over)
  return a && b ? moved([...rows], a, b) : [...rows]
}

// ダイアログの行から、プロジェクトを直すアクションの引数を作る（名前は前後の空白を除く。空の名前の行は入れない）
// 完了のレーンに選べる行: 名前のあるレーン（未分類の行と、名前が空の行は選べない）
type NamedLaneRow = Extract<LaneRow, { kind: "lane" }>
export const doneChoices = (lanes: readonly LaneRow[]): NamedLaneRow[] =>
  lanes.filter((l): l is NamedLaneRow => l.kind === "lane" && l.name.trim() !== "")

// 完了のレーンは、選んだ行の鍵 doneKey から決める（もうある行は id、新しい行は名前で指す。行が無ければ none）
export function doneLaneOf(lanes: readonly LaneRow[], doneKey: string): string {
  const row = doneChoices(lanes).find(l => l.key === doneKey)
  return row ? (row.id ?? row.name.trim()) : NO_DONE_LANE
}

// 行 key を完了のレーンにした行の並び（その行のチケットサイズを small にする。あとで利用者が変えてよい。完了のレーンを外しても戻さない）。
// 大きさを決めるのはこの画面だけで、project-update を直に呼んで完了のレーンを替えても、大きさは変わらない
export const sizedAsDone = (lanes: readonly LaneRow[], key: string): LaneRow[] =>
  lanes.map(l => (l.key === key && l.kind === "lane" ? { ...l, cardSize: DONE_LANE_CARD_SIZE } : l))

// 行 key を完了のレーンにしようとしたとき、ほかの行がもう完了のレーンなら、その行の今の名前（無ければ null）
export function doneElsewhereOf(lanes: readonly LaneRow[], doneKey: string, key: string): string | null {
  const other = doneChoices(lanes).find(l => l.key === doneKey)
  return other && other.key !== key ? other.name.trim() : null
}

// 完了のレーンに選んだ行に、担当のいるチケットがあるか（保存すると断られる。もう完了のレーンの行は、そのまま通る）
export function doneLaneBlocked(
  project: Project,
  lanes: readonly LaneRow[],
  doneKey: string,
  tickets: readonly { project: string; lane: string; assignees: readonly string[] }[],
): boolean {
  const id = doneChoices(lanes).find(l => l.key === doneKey)?.id
  return (
    id !== undefined &&
    id !== project.doneLane &&
    tickets.some(t => t.project === project.id && t.lane === id && t.assignees.length > 0)
  )
}

export function updateArgsOf(
  name: string,
  prefix: string,
  lanes: readonly LaneRow[],
  tags: readonly TagRow[],
  doneKey: string,
  cardSize: Project["cardSize"],
) {
  return {
    name: name.trim(),
    cardSize,
    prefix: prefix.trim(),
    doneLane: doneLaneOf(lanes, doneKey),
    lanes: lanes.flatMap((l): (Lane | { kind: "unsorted"; shown: boolean } | Omit<Lane, "id">)[] => {
      if (l.kind === "unsorted") return [{ kind: "unsorted", shown: l.shown }]
      if (l.name.trim() === "") return []
      return [
        { kind: "lane", ...(l.id ? { id: l.id } : {}), name: l.name.trim(), prompt: l.prompt, cardSize: l.cardSize },
      ]
    }),
    tags: tags.flatMap(({ key: _key, was: _was, ...t }) =>
      t.name.trim() === "" ? [] : [{ ...t, name: t.name.trim() }],
    ),
  }
}

// ダイアログで消したレーン（もうあるのに行に無い物）に入っているチケットが、保存すると見えなくなるか（未分類を表示しないとき）
export function hidesTickets(
  project: Project,
  lanes: readonly LaneRow[],
  tickets: readonly { project: string; lane: string }[],
): boolean {
  const unsorted = lanes.find(l => l.kind === "unsorted")
  if (unsorted?.kind === "unsorted" && unsorted.shown) return false
  const kept = new Set(named(lanes).flatMap(l => (l.id ? [l.id] : [])))
  const gone = new Set(project.lanes.flatMap(l => (l.kind === "lane" && !kept.has(l.id) ? [l.id] : [])))
  return tickets.some(t => t.project === project.id && gone.has(t.lane))
}
