// 参加者・ワークルームのレコードと、最後に呼ばれた時刻・モデルとブランチを読むフック
import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import type { WorkKey } from "../../../core/folders"
import { readerOf, sourceOf } from "../../../core/record-source"
import type { Records } from "../../../core/records"
import { isParticipantAlive } from "../../../core/settings"
import type { ParticipantLive, PendingMessage } from "../../../store/state"
import { useInstance, useMatomezuState } from "../../../ui/store-context"
import { useActions, useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import {
  ADMIN_MARK,
  ADMIN_SET,
  PARTICIPANT,
  PARTICIPANT_REMOVE,
  type Participant,
  WORKROOM,
  WORKROOM_REMOVE,
  type Workroom,
} from "."
import { workroomActivityOf } from "./activity"
import { adminRoomOf, type VisitorRow, visitorRows, type WorkroomRow, workroomRows } from "./rows"
import { ownBookPagesOf } from "./workdesks"
import { type FoundWorkerBook, foundWorkerBookOf, NO_WORKER_BOOK, workerBookOf, workerBookReadsOf } from "./worker-book"
import { NOT_CALLED } from "./workroom"

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

// 受け手の参加者 receiver の承認待ちの最初の 1 通（無ければ undefined）
export const usePendingMessageFor = (receiver: string): PendingMessage | undefined =>
  useMatomezuState(s => s.pendingMessages.find(m => m.receiver === receiver))

// 承認待ちの 1 通（id）。承認・キャンセルで消えれば undefined
export const usePendingMessageById = (id: string): PendingMessage | undefined =>
  useMatomezuState(s => s.pendingMessages.find(m => m.id === id))

// 承認・キャンセルを常駐に頼む（答えは知らせでも入る）。頼めなければ投げる
export const useAnswerMessage = (): ((id: string, answer: "approve" | "cancel") => Promise<void>) =>
  useInstance().answerMessage

// 参加者が生きているかを決める関数（最後に呼ばれた時刻と今の時刻から。参加の有効時間の設定で決まる）
// （呼ばれていなければ NOT_CALLED）
export function useIsAlive(): (calledAt: string | typeof NOT_CALLED, nowMs: number) => boolean {
  const catalog = useCoreCatalog()
  const settings = useMatomezuState(s => s.settings)
  return useCallback(
    (calledAt, nowMs) => isParticipantAlive(catalog, settings, calledAt === NOT_CALLED ? undefined : calledAt, nowMs),
    [catalog, settings],
  )
}

// 管理者のワークルームの id（管理者の印が指すワークルームが無ければ undefined）
export function useAdminRoom(): string | undefined {
  const mark = useMatomezuState(s => s.records[ADMIN_MARK.id]?.admin) as { workroom: string } | undefined
  return adminRoomOf(mark, useWorkrooms())
}

// ワークルームごとの行（管理者のワークルームが先頭）。生きているかは、行の calledAt から決める
export function useWorkroomRows(): readonly WorkroomRow[] {
  const catalog = useCoreCatalog()
  const rooms = useWorkrooms()
  const participants = useParticipants()
  const admin = useAdminRoom()
  const ready = useParticipantReady()
  const live = useParticipantLive()
  const calls = useParticipantCalls()
  const activities = useMatomezuState(
    useShallow(s => Object.fromEntries(rooms.map(r => [r.id, workroomActivityOf(catalog, s.records, r.id)]))),
  )
  return useMemo(
    () => workroomRows({ rooms, participants, admin, ready, live, calls, activities }),
    [rooms, participants, admin, ready, live, calls, activities],
  )
}

// ビジターの行（参加した順）
export function useVisitorRows(): readonly VisitorRow[] {
  const participants = useParticipants()
  const ready = useParticipantReady()
  const live = useParticipantLive()
  const calls = useParticipantCalls()
  return useMemo(() => visitorRows({ participants, ready, live, calls }), [participants, ready, live, calls])
}

// アクションを 1 件行う関数（useActions の perform）。成功なら ok が true で result を持ち、断られたら ok が false
export type Do = (
  id: string,
  args: object,
  on?: { record: string },
) => { ok: boolean; result?: unknown; reason?: string; permission?: string }

// ワークルームを動かす関数（ワークルームを出る・消す・管理者にする）。どれも 1 つのアクションで行って、断られたら断りをトーストで知らせ、行えたかを返す。
// 消すときは、いる参加者 occupant も同じアクションで外す
export interface WorkroomActions {
  leave: (occupant: string) => boolean
  remove: (room: string, occupant?: string) => boolean
  makeAdmin: (room: string) => boolean
}

export function useWorkroomActions(): WorkroomActions {
  const { perform, showToast } = useActions()
  const catalog = useCoreCatalog()
  // 管理者の印が在れば、その印を書き換える（無ければ作る）
  const marked = useMatomezuState(s => s.records[ADMIN_MARK.id]?.admin !== undefined)
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
      leave: occupant => settle(doing(PARTICIPANT_REMOVE.id, {}, { record: occupant })),
      remove: (room, occupant) =>
        settle(doing(WORKROOM_REMOVE.id, occupant === undefined ? {} : { occupant }, { record: room })),
      makeAdmin: room => settle(doing(ADMIN_SET.id, { workroom: room }, ...(marked ? [{ record: "admin" }] : []))),
    }
  }, [perform, showToast, catalog, marked])
}

// ワークルーム room 自身のワーカーブックのページの数（ワークルームを消す・引き継がずに入り直すと消える。ブックが無ければ 0）
export function useOwnBookPages(room: string): number {
  return useMatomezuState(s => ownBookPagesOf(s.folders, room))
}

const NO_PAGES: readonly string[] = []

// workKey が key のワーカーブック（tickets-history の中の実のブック）と、その中のページ（まだ無ければ NO_WORKER_BOOK）。ページが足されると描き直す
export function useWorkerBook(key: WorkKey): FoundWorkerBook | typeof NO_WORKER_BOOK {
  // ブックとページの並びを分けて読む（並びは中身で比べる）
  const book = useMatomezuState(s => {
    const found = foundWorkerBookOf(s.folders, key)
    return found === NO_WORKER_BOOK ? NO_WORKER_BOOK : found.book
  })
  const pages = useMatomezuState(
    useShallow(s => {
      const found = foundWorkerBookOf(s.folders, key)
      return found === NO_WORKER_BOOK ? NO_PAGES : found.pages
    }),
  )
  return useMemo(() => (book === NO_WORKER_BOOK ? NO_WORKER_BOOK : { book, pages }), [book, pages])
}

// ワークルーム room のワーカーブック（今の作業の物。作業が無いか、ワーカーブックを持てない作業なら、ワークルーム自身の物）
export function useWorkroomWorkerBook(room: string): FoundWorkerBook | typeof NO_WORKER_BOOK {
  const catalog = useCoreCatalog()
  const key = useMatomezuState(
    useShallow(s => {
      const read = readerOf(catalog, sourceOf(s.records as Records), workerBookReadsOf(catalog))
      const { workKey } = workerBookOf(catalog, read, room)
      return [workKey.subject, workKey.id] as const
    }),
  )
  return useWorkerBook(useMemo(() => ({ subject: key[0], id: key[1] }), [key[0], key[1]]))
}
