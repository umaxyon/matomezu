// ワークルームごとの行（参加者リストの 1 行）: ワークルーム・いる参加者・様子・管理者か・作業の様子。画面（コントロールセンターなど）は、判定を自分で持たずにこの行を読む。
// 管理者のワークルームは先頭に出し、ほかは受け取った順（作った順）。管理者の印が指すワークルームが無ければ、管理者は無い。
// 様子は 3 つ: 空室（いる参加者が無い）・準備中（受け入れたあと、AI のフックが参加を伝えるまで）・参加済み（準備中でない）。生きているかは行の様子でなく、最後に呼ばれた時刻（calledAt）で見る
import type { ParticipantLive } from "../../../store/state"
import type { AiUi, Participant, Workroom } from "."
import type { WorkroomActivity } from "./activity"
import { shownModel } from "./live"
import { NOT_CALLED, occupantOf } from "./workroom"

export { NOT_CALLED }

export type WorkroomState = "empty" | "preparing" | "ready"

// 空室で、いる参加者が無いときの値
export const NO_OCCUPANT = "none"
// 画面に出すモデルが無い（空室の）ときの値（モデルの名前はどんな文字列にもなるので、文字列でない定数）
export const NO_MODEL: unique symbol = Symbol("no model")
// git のブランチが知らされていないときの値（ブランチの名前はどんな文字列にもなるので、文字列でない定数）
export const NO_BRANCH: unique symbol = Symbol("no branch")
// その名前で入りたいと頼んでいる参加者がいないときの、頼んだ時刻の値
export const NOT_REQUESTED = "none"
// AI の UI が分からない（参加を頼んだ AI が添えなかった）ときの値
export const NO_AI_UI = "none"

export interface WorkroomRow {
  room: Workroom
  participant: Participant | typeof NO_OCCUPANT // いる参加者（空室なら NO_OCCUPANT）
  state: WorkroomState
  admin: boolean
  model: string | typeof NO_MODEL // 画面に出すモデル（AI のフックが知らせた今のモデルを、参加を頼んだときのモデルより先に。空室なら NO_MODEL）
  branch: string | typeof NO_BRANCH // git のブランチ（知らされた参加者だけ。ほかは NO_BRANCH）
  aiUi: AiUi | typeof NO_AI_UI // AI の UI（参加を頼んだ AI が添えた物。空室か、添えなければ NO_AI_UI）
  calledAt: string | typeof NOT_CALLED // 参加者が最後に呼ばれた時刻（呼ばれていなければ NOT_CALLED）
  requestedAt: string | typeof NOT_REQUESTED // このワークルームの名前で入りたいと頼んでいる要求中の参加者の、頼んだ時刻（いちばん新しいもの。無ければ NOT_REQUESTED）
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
    const participant = occupantOf(input.participants, room)
    const live = participant ? input.live[participant.id] : undefined
    const calledAt = participant ? input.calls[participant.id] : undefined
    const requestedAt = input.participants
      .filter(p => p.state === "requested" && p.wantedName === room.name)
      .map(p => p.requestedAt)
      .sort()
      .at(-1)
    return {
      room,
      participant: participant ?? NO_OCCUPANT,
      state: !participant ? "empty" : input.ready.includes(participant.id) ? "ready" : "preparing",
      admin: room.id === input.admin,
      model: participant ? shownModel(participant, live) : NO_MODEL,
      branch: live?.branch ? live.branch : NO_BRANCH,
      aiUi: participant?.aiUi ?? NO_AI_UI,
      calledAt: calledAt ? calledAt : NOT_CALLED,
      requestedAt: requestedAt ? requestedAt : NOT_REQUESTED,
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
  branch: string | typeof NO_BRANCH
  aiUi: AiUi | typeof NO_AI_UI
  calledAt: string | typeof NOT_CALLED
}

export function visitorRows(input: {
  participants: readonly Participant[] // 要求が届いた順
  ready: readonly string[]
  live: Readonly<Record<string, ParticipantLive>>
  calls: Readonly<Record<string, string>>
}): VisitorRow[] {
  return input.participants
    .filter(p => participantCategory(p) === "visitor")
    .sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "") || a.id.localeCompare(b.id))
    .map(participant => {
      const live = input.live[participant.id]
      const calledAt = input.calls[participant.id]
      return {
        participant,
        state: input.ready.includes(participant.id) ? "ready" : "preparing",
        model: shownModel(participant, live),
        branch: live?.branch ? live.branch : NO_BRANCH,
        aiUi: participant.aiUi ?? NO_AI_UI,
        calledAt: calledAt ? calledAt : NOT_CALLED,
      }
    })
}

// 参加者区分: ワーカー（ワークルームに入っている。管理者もワーカー）・ビジター（ワークルームを持たない）。
// 受け入れていない参加者は区分を持たない（NO_CATEGORY）。管理者かは管理者の印で決まる（adminRoomOf）
export type ParticipantCategory = "worker" | "visitor"
// 参加者区分を持たない（受け入れていない参加者の）ときの値
export const NO_CATEGORY = "none"

export function participantCategory(p: Participant): ParticipantCategory | typeof NO_CATEGORY {
  if (p.state === "visitor") return "visitor"
  return p.state === "joined" ? "worker" : NO_CATEGORY
}

// 管理者か: 管理者の印が指すワークルームに入っているワーカー（admin は adminRoomOf が答えるワークルームの id）
export const isAdminParticipant = (p: Participant, admin: string | undefined): boolean =>
  p.state === "joined" && admin !== undefined && p.workroom === admin

// ビジターの呼び名（ワークルームの名前が無いので、AI の名前と元のセッション名）
export const visitorName = (p: Participant): string => (p.sessionName ? `${p.ai} / ${p.sessionName}` : p.ai)
