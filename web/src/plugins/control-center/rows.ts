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

// 列の並び: 組の順に、1 管理者 2 作業中 3 空き（準備中も）4 空室。作業の様子を答える種類が無ければ、作業中と空きを分けない（2 に入れる）。
// 空室は、今のチケットが残っていても 4（引き継いで入り直せば、その様子で 2 か 3 に戻る）。
// 組の中は、変化のあった順（いる参加者の、呼ばれた時刻と参加した時刻の新しいほう。新しい順）、そのあとに変化の無い行を受け取った順（作った順）のまま。
// 準備中の行も、受け入れた時刻で並べる（引き継いで入った行が、準備中の間だけ組の下へ寄らないように）。
// 同じ時刻の行も受け取った順のまま。並べるだけで、画面の状態は持たない
const changedAtOf = (row: WorkroomRow): number | undefined => {
  const times = [row.calledAt, row.participant?.joinedAt]
    .flatMap(t => (t ? [Date.parse(t)] : []))
    .filter(Number.isFinite)
  return times.length === 0 ? undefined : Math.max(...times)
}

const groupOf = (row: WorkroomRow): number => {
  if (row.admin) return 1
  if (row.state === "empty") return 4
  if (row.state === "preparing") return 3
  return row.activity === "idle" ? 3 : 2
}

export function orderRows(rows: readonly WorkroomRow[]): WorkroomRow[] {
  const keyed = rows.map((row, i) => ({ row, i, group: groupOf(row), at: changedAtOf(row) }))
  keyed.sort(
    (a, b) =>
      a.group - b.group ||
      (a.at === undefined ? 1 : 0) - (b.at === undefined ? 1 : 0) ||
      (b.at ?? 0) - (a.at ?? 0) ||
      a.i - b.i,
  )
  return keyed.map(k => k.row)
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
