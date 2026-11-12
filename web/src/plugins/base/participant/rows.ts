// ワークルームごとの行（参加者リストの 1 行）: 部屋・いる参加者・様子・管理者か。画面（コントロールセンターなど）は、判定を自分で持たずにこの行を読む。
// 管理者の部屋は先頭に出し、ほかは受け取った順（部屋を作った順）。管理者の印が指す部屋が無ければ、管理者は無い。
// 様子は 3 つ: 空室（いる参加者が無い）・準備中（受け入れたあと、AI のフックが参加を伝えるまで）・参加済み（準備中でない）。生きているかは行の様子でなく、最後に呼ばれた時刻（calledAt）で見る
import type { ParticipantLive } from "../../../store/store"
import type { Participant, Workroom } from "."
import { shownModel } from "./live"

export type WorkroomState = "empty" | "preparing" | "ready"

export interface WorkroomRow {
  room: Workroom
  participant?: Participant // いる参加者（空室なら無い）
  state: WorkroomState
  admin: boolean
  model?: string // 画面に出すモデル（AI のフックが知らせた今のモデルを、参加を頼んだときのモデルより先に）
  branch?: string // git のブランチ（知らされた参加者だけ）
  calledAt?: string // 参加者が最後に呼ばれた時刻（呼ばれていなければ無い）
}

// 管理者の印（ADMIN_MARK のレコード。無い・none・部屋が無ければ undefined）が指す、部屋の id
export function adminRoomOf(mark: { workroom: string } | undefined, rooms: readonly Workroom[]): string | undefined {
  return mark && rooms.some(r => r.id === mark.workroom) ? mark.workroom : undefined
}

export function workroomRows(input: {
  rooms: readonly Workroom[] // 作った順
  participants: readonly Participant[]
  admin: string | undefined // 管理者の部屋の id（adminRoomOf）
  ready: readonly string[] // 準備中でない参加者の id
  live: Readonly<Record<string, ParticipantLive>>
  calls: Readonly<Record<string, string>> // 参加者の id → 最後に呼ばれた時刻
}): WorkroomRow[] {
  const rows = input.rooms.map((room): WorkroomRow => {
    const participant = input.participants.find(p => p.state === "joined" && p.workroom === room.id)
    const live = participant ? input.live[participant.id] : undefined
    const calledAt = participant ? input.calls[participant.id] : undefined
    return {
      room,
      ...(participant ? { participant } : {}),
      state: !participant ? "empty" : input.ready.includes(participant.id) ? "ready" : "preparing",
      admin: room.id === input.admin,
      ...(participant ? { model: shownModel(participant, live) } : {}),
      ...(live?.branch ? { branch: live.branch } : {}),
      ...(calledAt ? { calledAt } : {}),
    }
  })
  return [...rows.filter(r => r.admin), ...rows.filter(r => !r.admin)]
}
