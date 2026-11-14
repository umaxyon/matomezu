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

// 列の並び: 管理者を先頭に固定し、次に、変化のあった順（参加済みの行の、呼ばれた時刻と参加した時刻の新しいほう。新しい順）、最後に変化の無い行（空室・準備中）を、受け取った順のまま。
// 同じ時刻の行は受け取った順（作った順）のまま。並べるだけで、画面の状態は持たない
const changedAtOf = (row: WorkroomRow): number | undefined => {
  if (row.state !== "ready") return undefined
  const times = [row.calledAt, row.participant?.joinedAt]
    .flatMap(t => (t ? [Date.parse(t)] : []))
    .filter(Number.isFinite)
  return times.length === 0 ? undefined : Math.max(...times)
}

export function orderByChange(rows: readonly WorkroomRow[]): WorkroomRow[] {
  const rest = rows.filter(r => !r.admin)
  const changed = rest.flatMap(row => {
    const at = changedAtOf(row)
    return at === undefined ? [] : [{ row, at }]
  })
  changed.sort((a, b) => b.at - a.at)
  const kept = new Set(changed.map(c => c.row))
  return [...rows.filter(r => r.admin), ...changed.map(c => c.row), ...rest.filter(r => !kept.has(r))]
}

// 並びを止めている間（列に触れている間）の並び: 止めた時の並び（id の列）に従い、新しく出た行は最後に
export function orderHeld(rows: readonly WorkroomRow[], held: readonly string[]): WorkroomRow[] {
  const at = (r: WorkroomRow) => {
    const i = held.indexOf(r.room.id)
    return i < 0 ? held.length : i
  }
  return [...rows].sort((a, b) => at(a) - at(b))
}

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
