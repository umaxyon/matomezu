// 参加者の一覧の行の下の 1 行（見た目でない所で決める）: 空室は（空室）、準備中は（準備中）、参加済みは base のスロット（workroom-row-line）に置かれたウィジェットが出す
import type { WorkroomRow } from "../base"

export type RowDetail = "empty" | "preparing" | "slot"

export function rowDetail(row: WorkroomRow): RowDetail {
  if (row.state === "empty") return "empty"
  return row.state === "preparing" ? "preparing" : "slot"
}

// 選んでいるワークルームの行（選んだワークルームが無くなっていれば、選んでいないのと同じ）
export const pickedRow = (rows: readonly WorkroomRow[], picked: string | undefined): WorkroomRow | undefined =>
  rows.find(r => r.room.id === picked)

// ワークルームの枠の「最終アクセス」の出し方: 呼ばれた時刻があればそれ、無ければ準備中か、なし
export type LastAccess = "called" | "preparing" | "none"

export const lastAccessOf = (row: WorkroomRow): LastAccess =>
  row.calledAt ? "called" : row.state === "preparing" ? "preparing" : "none"

// 枠（左の列・ワークルームの枠）が画面の外へ退くか。前に出している画面の最大化と、中身が名乗った最大化（useControlCenterMaximized）から決める。
// 書庫を前に出して書庫を最大化している間は左の列だけ、プロジェクトの画面を前に出して中身が最大化している間は左の列とワークルームの枠が退く。
// 前に出していない画面の最大化は、枠を動かさない（ブラウザの戻るで画面が替わっても、枠が退いたまま戻れなくなるのを防ぐ）
export interface Retreat {
  left: boolean
  workroom: boolean
}

export function retreatOf(
  front: "projects" | "library",
  libraryMaximized: boolean,
  contentMaximized: boolean,
): Retreat {
  const library = front === "library" && libraryMaximized
  const projects = front === "projects" && contentMaximized
  return { left: library || projects, workroom: projects }
}
