// ワークルームの名前の重なりの見方。生きているかは、最後に呼ばれた時刻と今の時刻で決まる（アクションの入力に無いので、受け入れる画面とホストの join が確かめる）
import type { Participant, Participants } from "../../../core/participant"

type IsAlive = (calledAt: string | undefined, nowMs: number) => boolean

// 引き継げる参加者: 受け入れ済みで、生きていない参加者（受け入れた順）
export function takeable(
  participants: Participants,
  calls: Readonly<Record<string, string>>,
  isAlive: IsAlive,
  nowMs: number,
): Participant[] {
  return participants.filter(p => p.state === "joined" && p.workroom !== undefined && !isAlive(calls[p.id], nowMs))
}

// ワークルームの名前が、生きている受け入れ済みの参加者にすでに使われているか（使われていれば、同じ名前では受け入れない）
export function workroomInUse(
  participants: Participants,
  calls: Readonly<Record<string, string>>,
  name: string,
  isAlive: IsAlive,
  nowMs: number,
): boolean {
  const trimmed = name.trim()
  return (
    trimmed !== "" &&
    participants.some(p => p.state === "joined" && p.workroom === trimmed && isAlive(calls[p.id], nowMs))
  )
}
