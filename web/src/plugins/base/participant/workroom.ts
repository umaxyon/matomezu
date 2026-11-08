// ワークルームの名前が、生きている受け入れ済みの参加者にすでに使われているか（使われていれば、同じ名前では受け入れない）
import type { Participants } from "../../../core/participant"

export function workroomInUse(
  participants: Participants,
  calls: Readonly<Record<string, string>>,
  name: string,
  isAlive: (calledAt: string | undefined, nowMs: number) => boolean,
  nowMs: number,
): boolean {
  const trimmed = name.trim()
  return (
    trimmed !== "" &&
    participants.some(p => p.state === "joined" && p.workroom === trimmed && isAlive(calls[p.id], nowMs))
  )
}
