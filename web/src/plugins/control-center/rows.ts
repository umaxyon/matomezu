// 参加者の一覧の行の名前の下（見た目でない所で決める）: 準備中は（準備中）、空室と参加済みは スロット workroom-row-line に置かれたウィジェットが出す（空室かを渡す）
import type { NO_STATE } from "../../plugin-api"
import { NO_OCCUPANT, NOT_CALLED, NOT_REQUESTED, type WorkroomRow } from "../base"
import type { ContentArea } from "./control-center"

export type RowDetail = "empty" | "preparing" | "slot"

export function rowDetail(row: WorkroomRow): RowDetail {
  if (row.state === "empty") return "empty"
  return row.state === "preparing" ? "preparing" : "slot"
}

// 選んでいるワークルームの行（選んだワークルームが無くなっていれば、選んでいないのと同じ）
export const pickedRow = (rows: readonly WorkroomRow[], picked: string | typeof NO_STATE): WorkroomRow | undefined =>
  rows.find(r => r.room.id === picked)

// 列の並び: 組の順に、1 管理者 2 作業中 3 空き（準備中も）4 空室。作業の様子を答える種類が無ければ、作業中と空きを分けない（2 に入れる）。
// 空室は、カレントチケットが残っていても 4（引き継いで入り直せば、その様子で 2 か 3 に戻る）。ただし、その名前で入りたいと頼まれている空室は 3（頼まれた時刻で並べる）。
// 同じ名前の join で前の参加者が退室したとき、受け入れを待つ間に行が下の組へ寄らないように。
// 組の中は、変化のあった順（いる参加者の、呼ばれた時刻と参加した時刻の新しいほう。新しい順）、そのあとに変化の無い行を受け取った順（作った順）のまま。
// 準備中の行も、受け入れた時刻で並べる（引き継いで入った行が、準備中の間だけ組の下へ寄らないように）。
// 同じ時刻の行も受け取った順のまま。並べるだけで、画面の状態は持たない
const changedAtOf = (row: WorkroomRow): number | undefined => {
  const times = [
    row.calledAt !== NOT_CALLED ? row.calledAt : undefined,
    row.participant !== NO_OCCUPANT ? row.participant.joinedAt : undefined,
    row.state === "empty" && row.requestedAt !== NOT_REQUESTED ? row.requestedAt : undefined,
  ]
    .flatMap(t => (t ? [Date.parse(t)] : []))
    .filter(Number.isFinite)
  return times.length === 0 ? undefined : Math.max(...times)
}

const groupOf = (row: WorkroomRow): number => {
  if (row.admin) return 1
  if (row.state === "empty") return row.requestedAt !== NOT_REQUESTED ? 3 : 4
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

// 途中の様子の行: 準備中と、その名前で入りたいと頼まれている空室（受け入れやフックが続けて来れば、すぐ抜ける）。
// 列は、行がこの様子に入ってから PASSING_WAIT_MS の間、前の並びで止める（useSettledOrder。途中の位置へ動いてからすぐ戻るのを見せない）
export const PASSING_WAIT_MS = 3000

export const passingRow = (row: WorkroomRow): boolean =>
  row.state === "preparing" || (row.state === "empty" && row.requestedAt !== NOT_REQUESTED)

// 待つための覚え: 行が途中の様子に入った時刻（ワークルームの id → ミリ秒）と、止めていない間の最後の並び（id の列）
export interface Settling {
  entered: ReadonlyMap<string, number>
  settled: readonly string[]
}

// 時点 now に出す並び（rows）と、次の覚え（next）、待ち終わる時刻（wakeAt。待っていなければ無い）。
// 途中の様子に入ってから PASSING_WAIT_MS の間の行があれば、覚えた並びで止める（新しく出た行は最後）。無ければ ordered のまま
export function settleOrder(
  ordered: readonly WorkroomRow[],
  prev: Settling | undefined,
  now: number,
): { rows: WorkroomRow[]; next: Settling; wakeAt?: number } {
  const ids = ordered.map(r => r.room.id)
  const entered = new Map<string, number>()
  for (const row of ordered) if (passingRow(row)) entered.set(row.room.id, prev?.entered.get(row.room.id) ?? now)
  const until = [...entered.values()].map(at => at + PASSING_WAIT_MS).filter(t => t > now)
  if (until.length === 0 || !prev) return { rows: [...ordered], next: { entered, settled: ids } }
  return {
    rows: orderHeld(ordered, prev.settled),
    next: { entered, settled: prev.settled },
    wakeAt: Math.min(...until),
  }
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

export const lastAccessOf = (row: Pick<WorkroomRow, "calledAt" | "state">): LastAccess =>
  row.calledAt !== NOT_CALLED ? "called" : row.state === "preparing" ? "preparing" : "none"

// 枠（左の列・ワークルームの枠）が画面の外へ退くか。コンテンツエリアに出している画面と、その最大化と、中身が名乗った最大化（useControlCenterMaximized）から決める。
// 左の列は、書庫・郵便箱を出してそれを最大化している間と、プロジェクトの画面を出して中身が最大化している間に退く。
// ワークルームの枠は、郵便箱の最大化とプロジェクトの中身の最大化の間と、書庫を出している間に退く（枠を下に置くのはプロジェクトと郵便箱の画面だけ）。
// コンテンツエリアに出していない画面の最大化は、枠を動かさない（ブラウザの戻るで画面が替わっても、枠が退いたまま戻れなくなるのを防ぐ）
export interface Retreat {
  left: boolean
  workroom: boolean
}

export function retreatOf(
  shown: ContentArea,
  maximized: { readonly library: boolean; readonly mailbox: boolean },
  contentMaximized: boolean,
): Retreat {
  const area = (shown === "library" && maximized.library) || (shown === "mailbox" && maximized.mailbox)
  const projects = shown === "projects" && contentMaximized
  return {
    left: area || projects,
    workroom: projects || shown === "library" || (shown === "mailbox" && maximized.mailbox),
  }
}
