// 参加者リストの行の下の 1 行（見た目でない所で決める）: 空室は（空室）、準備中は（準備中）、参加済みは（空き）。
// 管理者の行は、参加済みで空きのとき何も出さない（高い行の下の 1 行は今のタスクのために空けてある）
import type { WorkroomRow } from "../base"

export type RowDetail = "empty" | "preparing" | "idle" | "none"

export function rowDetail(row: WorkroomRow): RowDetail {
  if (row.state === "empty") return "empty"
  if (row.state === "preparing") return "preparing"
  return row.admin ? "none" : "idle"
}

// 選んでいるワークルームの行（選んだ部屋が無くなっていれば、選んでいないのと同じ）
export const pickedRow = (rows: readonly WorkroomRow[], picked: string | undefined): WorkroomRow | undefined =>
  rows.find(r => r.room.id === picked)
