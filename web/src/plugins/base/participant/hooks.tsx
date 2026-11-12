// 参加者・ワークルームのレコードと、最後に呼ばれた時刻・モデルとブランチを読むフック
import { useCallback, useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { isParticipantAlive } from "../../../core/settings"
import type { ParticipantLive } from "../../../store/store"
import { useMatomezuState } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { PARTICIPANT, type Participant, WORKROOM, type Workroom } from "."

// 参加者のレコード（種類 PARTICIPANT。要求が届いた順）と、ワークルームのレコード（作った順）
const sorted = <T extends { id: string }>(records: Readonly<Record<string, unknown>> | undefined, key: keyof T) =>
  (Object.values(records ?? {}) as T[]).sort(
    (a, b) => String(a[key]).localeCompare(String(b[key])) || a.id.localeCompare(b.id),
  )
export const useParticipants = (): readonly Participant[] =>
  useMatomezuState(useShallow(s => sorted<Participant>(s.records[PARTICIPANT.id], "requestedAt")))
export const useWorkrooms = (): readonly Workroom[] =>
  useMatomezuState(useShallow(s => sorted<Workroom>(s.records[WORKROOM.id], "createdAt")))

// 参加者の id → 最後に呼ばれた時刻
export const useParticipantCalls = (): Readonly<Record<string, string>> => useMatomezuState(s => s.participantCalls)

// 参加者の id → AI のフックが知らせたモデルと、MCP が添えた git のブランチ
export const useParticipantLive = (): Readonly<Record<string, ParticipantLive>> =>
  useMatomezuState(s => s.participantLive)

// 準備中でない参加者の id
export const useParticipantReady = (): readonly string[] => useMatomezuState(s => s.participantReady)

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
