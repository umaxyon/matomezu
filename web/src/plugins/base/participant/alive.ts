// 参加の有効時間: 参加者が最後に呼ばれてから、その参加者を「生きている」とする長さ（利用者の設定の項目）と、生きているかの判定
import { z } from "zod"
import type { Participant } from "../../../core/participant"
import { kit } from "../kit"

// 選べる有効時間: 分の数
export const PARTICIPANT_ALIVE_CHOICES = ["15", "30", "60", "120", "480"] as const
export const PARTICIPANT_ALIVE = kit.defineSetting({
  id: "participant-alive",
  title: "Participation lasts",
  schema: z.enum(PARTICIPANT_ALIVE_CHOICES),
  role: "participant-alive",
  default: "60",
  optionTitles: {
    "15": kit.message("15 minutes"),
    "30": kit.message("30 minutes"),
    "60": kit.message("60 minutes"),
    "120": kit.message("2 hours"),
    "480": kit.message("8 hours"),
  },
})

// 設定の値 choice（形に合わなければ既定）の、ミリ秒
export function aliveMs(choice: unknown): number {
  const parsed = PARTICIPANT_ALIVE.schema.safeParse(choice)
  return Number(parsed.success ? parsed.data : PARTICIPANT_ALIVE.default) * 60_000
}

// 最後に呼ばれた時刻 calledAt（無ければ呼ばれていない）から、時点 nowMs までが有効時間 choice 以内か
export function isAlive(calledAt: string | undefined, nowMs: number, choice: unknown): boolean {
  if (!calledAt) return false
  const at = Date.parse(calledAt)
  return !Number.isNaN(at) && nowMs - at < aliveMs(choice)
}

// 同じワークルーム名の、生きている参加者（受け入れた物）がいるか
export function nameInUse(
  participants: readonly Participant[],
  calls: Readonly<Record<string, string>>,
  name: string,
  nowMs: number,
  choice: unknown,
): boolean {
  return participants.some(p => p.state === "joined" && p.workroom === name && isAlive(calls[p.id], nowMs, choice))
}
