// 参加者の表と、最後に呼ばれた時刻を読むフック
import { useEffect, useState } from "react"
import type { Participants } from "../../../core/participant"
import { useMatomezuState } from "../../../ui/store-context"
import { useUserSetting } from "../../../ui/view-hooks"
import { PARTICIPANT_ALIVE } from "./alive"

// 利用者の参加者の表（要求が届いた順）
export const useParticipants = (): Participants => useMatomezuState(s => s.participants)

// 参加者の id → 最後に呼ばれた時刻
export const useParticipantCalls = (): Readonly<Record<string, string>> => useMatomezuState(s => s.participantCalls)

// 参加の有効時間の設定の値
export const useAliveChoice = (): unknown => useUserSetting(PARTICIPANT_ALIVE.id)

// 今の時刻（ミリ秒）。生きているかは時が経つと変わるので、interval ミリ秒ごとに進める
export function useNowMs(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [interval])
  return now
}
