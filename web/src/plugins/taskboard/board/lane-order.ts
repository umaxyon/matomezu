// レーンのドラッグによる並べ替え（見た目でない）: プロジェクトのレーンの並び（未分類の行を含む）で、dragging のレーンを over のレーンの位置へ移す。
// 未分類の行はレーンの id を持たず、未分類のレーンの値 UNSORTED で呼ぶ

import type { Project } from "../project"
import { UNSORTED } from "../project"
import { moved } from "../reorder/order"

type LaneRow = Project["lanes"][number]

export const laneKeyOf = (row: LaneRow): string => (row.kind === "lane" ? row.id : UNSORTED)

export function movedLanes(lanes: readonly LaneRow[], dragging: string, over: string): LaneRow[] {
  const from = lanes.find(l => laneKeyOf(l) === dragging)
  const to = lanes.find(l => laneKeyOf(l) === over)
  return from && to ? moved(lanes, from, to) : [...lanes]
}
