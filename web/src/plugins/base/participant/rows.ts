// ワークルームごとの行（参加者リストの 1 行）: ワークルーム・いる参加者・様子・管理者か・作業の様子。画面（コントロールセンターなど）は、判定を自分で持たずにこの行を読む。
// 管理者のワークルームは先頭に出し、ほかは受け取った順（作った順）。管理者の印が指すワークルームが無ければ、管理者は無い。
// 様子は 3 つ: 空室（いる参加者が無い）・準備中（受け入れたあと、AI のフックが参加を伝えるまで）・参加済み（準備中でない）。生きているかは行の様子でなく、最後に呼ばれた時刻（calledAt）で見る
import type { ParticipantLive } from "../../../store/store"
import type { Participant, Workroom } from "."
import type { WorkroomActivity } from "./activity"
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
  requestedAt?: string // このワークルームの名前で入りたいと頼んでいる要求中の参加者の、頼んだ時刻（いちばん新しいもの。無ければ無い）
  activity: WorkroomActivity | "unknown" // 作業の様子（activity.ts。見せるためだけ。答える種類が無ければ unknown）
}

// 管理者の印（ADMIN_MARK のレコード。無い・none・ワークルームが無ければ undefined）が指す、ワークルームの id
export function adminRoomOf(
  mark: { workroom: string } | undefined,
  rooms: readonly Pick<Workroom, "id">[],
): string | undefined {
  return mark && rooms.some(r => r.id === mark.workroom) ? mark.workroom : undefined
}

export function workroomRows(input: {
  rooms: readonly Workroom[] // 作った順
  participants: readonly Participant[]
  admin: string | undefined // 管理者のワークルームの id（adminRoomOf）
  ready: readonly string[] // 準備中でない参加者の id
  live: Readonly<Record<string, ParticipantLive>>
  calls: Readonly<Record<string, string>> // 参加者の id → 最後に呼ばれた時刻
  activities: Readonly<Record<string, WorkroomActivity | "unknown">> // ワークルームの id → 作業の様子（無ければ unknown）
}): WorkroomRow[] {
  const rows = input.rooms.map((room): WorkroomRow => {
    const participant = input.participants.find(p => p.state === "joined" && p.workroom === room.id)
    const live = participant ? input.live[participant.id] : undefined
    const calledAt = participant ? input.calls[participant.id] : undefined
    const requestedAt = input.participants
      .filter(p => p.state === "requested" && p.wantedName === room.name)
      .map(p => p.requestedAt)
      .sort()
      .at(-1)
    return {
      room,
      ...(participant ? { participant } : {}),
      state: !participant ? "empty" : input.ready.includes(participant.id) ? "ready" : "preparing",
      admin: room.id === input.admin,
      ...(participant ? { model: shownModel(participant, live) } : {}),
      ...(live?.branch ? { branch: live.branch } : {}),
      ...(calledAt ? { calledAt } : {}),
      ...(requestedAt ? { requestedAt } : {}),
      activity: input.activities[room.id] ?? "unknown",
    }
  })
  return [...rows.filter(r => r.admin), ...rows.filter(r => !r.admin)]
}

// ビジターの行（参加者リストのビジターの節の 1 行）: ワークルームを持たない、受け入れ済みの参加者。参加した順
export interface VisitorRow {
  participant: Participant
  state: Exclude<WorkroomState, "empty">
  model: string
  branch?: string
  calledAt?: string
}

export function visitorRows(input: {
  participants: readonly Participant[] // 要求が届いた順
  ready: readonly string[]
  live: Readonly<Record<string, ParticipantLive>>
  calls: Readonly<Record<string, string>>
}): VisitorRow[] {
  return input.participants
    .filter(p => participantCategory(p, undefined) === "visitor")
    .sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "") || a.id.localeCompare(b.id))
    .map(participant => {
      const live = input.live[participant.id]
      const calledAt = input.calls[participant.id]
      return {
        participant,
        state: input.ready.includes(participant.id) ? "ready" : "preparing",
        model: shownModel(participant, live),
        ...(live?.branch ? { branch: live.branch } : {}),
        ...(calledAt ? { calledAt } : {}),
      }
    })
}

// 参加者区分: 管理者（管理者の印が指すワークルームに入っている）・ワーカー（ほかのワークルームに入っている）・ビジター（ワークルームを持たない）。
// 受け入れていない参加者は区分を持たない（undefined）
export type ParticipantCategory = "admin" | "worker" | "visitor"

export function participantCategory(p: Participant, admin: string | undefined): ParticipantCategory | undefined {
  if (p.state === "visitor") return "visitor"
  if (p.state !== "joined") return undefined
  return p.workroom === admin ? "admin" : "worker"
}

// ビジターの呼び名（ワークルームの名前が無いので、AI の名前と元のセッション名）
export const visitorName = (p: Participant): string => (p.sessionName ? `${p.ai} / ${p.sessionName}` : p.ai)
