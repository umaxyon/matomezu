// 参加者・ワークルームのレコードと、最後に呼ばれた時刻・モデルとブランチを読むフック
import { useCallback, useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { isParticipantAlive } from "../../../core/settings"
import type { ParticipantLive } from "../../../store/store"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { ADMIN_MARK, PARTICIPANT, type Participant, WORKROOM, type Workroom } from "."
import { type Do, leaveWorkroom, makeAdmin, removeWorkroom } from "./join-flow"
import { adminRoomOf, type WorkroomRow, workroomRows } from "./rows"

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

// 管理者のワークルームの id（管理者の印が指すワークルームが無ければ undefined）
export function useAdminRoom(): string | undefined {
  const mark = useMatomezuState(s => s.records[ADMIN_MARK.id]?.admin) as { workroom: string } | undefined
  return adminRoomOf(mark, useWorkrooms())
}

// ワークルームごとの行（管理者のワークルームが先頭）。生きているかは、行の calledAt から決める
export function useWorkroomRows(): readonly WorkroomRow[] {
  const rooms = useWorkrooms()
  const participants = useParticipants()
  const admin = useAdminRoom()
  const ready = useParticipantReady()
  const live = useParticipantLive()
  const calls = useParticipantCalls()
  return useMemo(
    () => workroomRows({ rooms, participants, admin, ready, live, calls }),
    [rooms, participants, admin, ready, live, calls],
  )
}

// ワークルームを動かす関数（ワークルームを出る・消す・管理者にする）。どれも行って、断られたら断りをトーストで知らせ、行えたかを返す。
// 消すときは、いる参加者を先に外す（続けて行う。外したあとに消すのが断られたら、空室が残る）
export interface WorkroomActions {
  leave: (occupant: string) => boolean
  remove: (room: string, occupant?: string) => boolean
  makeAdmin: (room: string) => boolean
}

export function useWorkroomActions(): WorkroomActions {
  const { perform, showToast } = useActions()
  const catalog = useCoreCatalog()
  return useMemo(() => {
    const doing = perform as unknown as Do
    const settle = (done: ReturnType<Do>) => {
      if (!done.ok)
        showToast({
          kind: "warn",
          message: refusalMessage(
            catalog,
            { reason: done.reason ?? "", ...(done.permission ? { permission: done.permission } : {}) },
            kit.message("Could not change the workroom"),
          ),
        })
      return done.ok
    }
    return {
      leave: occupant => settle(leaveWorkroom(doing, occupant)),
      remove: (room, occupant) => settle(removeWorkroom(doing, room, occupant)),
      makeAdmin: room => settle(makeAdmin(doing, room)),
    }
  }, [perform, showToast, catalog])
}
