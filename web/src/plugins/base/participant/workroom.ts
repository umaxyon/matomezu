// ワークルームの定義と見方。生きているかは、最後に呼ばれた時刻と今の時刻と、起こす知らせを渡せる matomezu watch がつながっているかで決まる
// （アクションの入力に無いので、受け入れのダイアログが見て、行うアクションの選び方を決める）
import { z } from "zod"
import type { WakeReach } from "../../../core/settings"
import { BIRD_IDS } from "../birds"
import { BIRD_PALETTE_IDS } from "../birds/colors"
import { kit } from "../kit"
import type { Participant, Workroom } from "."

// 作業のレコードの印（種類と id）
const WORK_KEY = z.strictObject({ subject: z.string().min(1), id: z.string().min(1) })

export const WORKROOM_NAME_MAX = 20 // ワークルームの名前の長さの上限（字。常駐がホストをまたぐ封筒で確かめる workroomNameMax と同じ）

export const WORKROOM = kit.defineSubject({
  id: "workroom",
  title: "workroom",
  aiDescription:
    "A workroom: a name (up to 20 characters, not repeated), a bird and its palette. A workroom with no participant in it is empty. work is the record of its current work (none when idle); handoffTarget is the work it had before that (its AI writes the handoff page into that work's worker book with refresh-request).",
  role: "workrooms",
  record: z.strictObject({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(WORKROOM_NAME_MAX),
    bird: z.enum(BIRD_IDS),
    palette: z.enum(BIRD_PALETTE_IDS).optional(),
    createdAt: z.string(),
    // 今の作業の写し（作業のレコード。空きなら無い）と、引継ぎ対象チケット（その前の作業のレコード。AI が refresh-request で引継ぎページを書く先）。
    // どちらも base のフォローステップ（work-change.ts）が、作業が替わった書き込みの中で書く
    work: WORK_KEY.optional(),
    handoffTarget: WORK_KEY.optional(),
  }),
  keys: {
    name: { type: "text", of: w => w.name },
    createdAt: { type: "text", of: w => w.createdAt },
  },
})

// 参加者が呼ばれていないときの、最後に呼ばれた時刻の値
export const NOT_CALLED = "none"

// 参加者の、生きているかを決める様子: 最後に呼ばれた時刻（呼ばれていなければ NOT_CALLED）と、起こす知らせを渡せる matomezu watch がつながっているか
export interface Presence {
  calledAt: string | typeof NOT_CALLED
  wake: WakeReach
}

type IsAlive = (presence: Presence, nowMs: number) => boolean

// ワークルームにいる受け入れ済みの参加者（いなければ空室）
export const occupantOf = (participants: readonly Participant[], room: Workroom): Participant | undefined =>
  participants.find(p => p.state === "joined" && p.workroom === room.id)

// 引き継げるワークルーム: 空室か、いる参加者が生きていないワークルーム（作った順）
export function takeable(
  rooms: readonly Workroom[],
  participants: readonly Participant[],
  presenceOf: (participant: string) => Presence,
  isAlive: IsAlive,
  nowMs: number,
): Workroom[] {
  return rooms.filter(r => {
    const who = occupantOf(participants, r)
    return who === undefined || !isAlive(presenceOf(who.id), nowMs)
  })
}

// ワークルームの名前が、すでにあるワークルームに使われているか（同じ名前のワークルームは作れない）
export const nameInUse = (rooms: readonly Workroom[], name: string): Workroom | undefined => {
  const trimmed = name.trim()
  return trimmed === "" ? undefined : rooms.find(r => r.name === trimmed)
}
