// 参加者の表と、最後に呼ばれた時刻を読むフック
import { useCallback, useEffect, useState } from "react"
import type { Participants } from "../../../core/participant"
import { isParticipantAlive } from "../../../core/settings"
import { useMatomezuState } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"

// 利用者の参加者の表（要求が届いた順）
export const useParticipants = (): Participants => useMatomezuState(s => s.participants)

// 参加者の id → 最後に呼ばれた時刻
export const useParticipantCalls = (): Readonly<Record<string, string>> => useMatomezuState(s => s.participantCalls)

// 参加者が生きているかを決める関数（最後に呼ばれた時刻と今の時刻から。参加の有効時間の設定で決まる）
export function useIsAlive(): (calledAt: string | undefined, nowMs: number) => boolean {
  const catalog = useCoreCatalog()
  const settings = useMatomezuState(s => s.settings)
  return useCallback((calledAt, nowMs) => isParticipantAlive(catalog, settings, calledAt, nowMs), [catalog, settings])
}

// 今の時刻（ミリ秒）。生きているかは時が経つと変わるので、interval ミリ秒ごとに進める
export function useNowMs(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [interval])
  return now
}
