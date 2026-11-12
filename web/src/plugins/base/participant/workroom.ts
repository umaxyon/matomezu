// ワークルームの見方。生きているかは、最後に呼ばれた時刻と今の時刻で決まる（アクションの入力に無いので、受け入れのダイアログが見て、行うアクションの選び方を決める）
import type { Participant, Workroom } from "."

type IsAlive = (calledAt: string | undefined, nowMs: number) => boolean

// ワークルームにいる受け入れ済みの参加者（いなければ空室）
export const occupantOf = (participants: readonly Participant[], room: Workroom): Participant | undefined =>
  participants.find(p => p.state === "joined" && p.workroom === room.id)

// 引き継げるワークルーム: 空室か、いる参加者が生きていないワークルーム（作った順）
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

// ワークルームの名前が、すでにあるワークルームに使われているか（同じ名前のワークルームは作れない）
export const nameInUse = (rooms: readonly Workroom[], name: string): Workroom | undefined => {
  const trimmed = name.trim()
  return trimmed === "" ? undefined : rooms.find(r => r.name === trimmed)
}
