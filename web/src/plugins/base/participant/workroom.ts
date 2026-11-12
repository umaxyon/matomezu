// 部屋の見方。生きているかは、最後に呼ばれた時刻と今の時刻で決まる（アクションの入力に無いので、受け入れのダイアログが見て、行うアクションの選び方を決める）
import type { Participant, Workroom } from "."

type IsAlive = (calledAt: string | undefined, nowMs: number) => boolean

// 部屋にいる受け入れ済みの参加者（いなければ空室）
export const occupantOf = (participants: readonly Participant[], room: Workroom): Participant | undefined =>
  participants.find(p => p.state === "joined" && p.workroom === room.id)

// 引き継げる部屋: 空室か、いる参加者が生きていない部屋（作った順）
export function takeable(
  rooms: readonly Workroom[],
  participants: readonly Participant[],
  calls: Readonly<Record<string, string>>,
  isAlive: IsAlive,
  nowMs: number,
): Workroom[] {
  return rooms.filter(r => {
    const who = occupantOf(participants, r)
    return who === undefined || !isAlive(calls[who.id], nowMs)
  })
}

// ワークルームの名前が、すでにある部屋に使われているか（同じ名前の部屋は作れない）
export const nameInUse = (rooms: readonly Workroom[], name: string): Workroom | undefined => {
  const trimmed = name.trim()
  return trimmed === "" ? undefined : rooms.find(r => r.name === trimmed)
}
