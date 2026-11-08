// 参加者: いまワークルームに入っているセッション 1 つの記録。参加者の表は利用者に 1 つで、要求の届いた順に持つ。
// 状態は requested（要求が届いて、利用者が受け入れていない）か joined（受け入れた）。ワークルームの名前・鳥・配色は受け入れたときに決まる。
// link は使い捨ての合言葉で、画面には出さない（同じ link の要求は 1 つの参加者にまとまる）
import { z } from "zod"
import type { CoreCatalog } from "./core-catalog"
import { isProject } from "./project"

export const ParticipantSchema = z.object({
  id: z.string().min(1),
  state: z.enum(["requested", "joined"]),
  ai: z.string(), // AI の名前（claude・codex など）
  model: z.string(),
  env: z.string(), // 環境名
  sessionName: z.string(), // 元のセッション名（空でもよい）
  link: z.string().min(1),
  projects: z.array(z.string().min(1)).min(1), // 参加しているプロジェクトの id（core/project.ts。重ならない）
  workroom: z.string().min(1).optional(), // ワークルームの名前（受け入れたときに決まる）
  requestedAt: z.string(), // 要求が届いた時点
  joinedAt: z.string().optional(), // 受け入れた時点
  bird: z.string().min(1).optional(), // 受け入れたときに選んだ鳥（鳥の id は base が決める）
  palette: z.string().min(1).optional(), // 鳥の配色（無ければ、その鳥の元の配色）
})
export type Participant = z.output<typeof ParticipantSchema>

// 参加者の表: 参加者の並び（要求が届いた順）
export type Participants = readonly Participant[]

// 残しておいた参加者の表（外から来る値。並びでなければ空とし、中の 1 つずつは確かめずに持つ）
export const restoreParticipants = (saved: unknown): Participants =>
  Array.isArray(saved) ? (saved as Participant[]) : []

// 参加者の表のアクションの結果 after が形を守っているか: 前 before に無かった（変わった）参加者が、形に合うか
export function participantsSettle(before: Participants, after: Participants): boolean {
  const kept = new Set(before)
  return after.every(p => kept.has(p) || (ParticipantSchema.safeParse(p).success && p.projects.every(isProject)))
}

// AI が参加を頼むときに行うアクション（アクションの定義が runsWhenAIJoins で名乗る物）の id。役が揃っていなければ null
export function joinActions(catalog: CoreCatalog): { participant: string; notice: string } | null {
  const roles = new Map<string, string>()
  for (const a of catalog.actions.values()) if (a.runsWhenAIJoins) roles.set(a.runsWhenAIJoins, a.id)
  const participant = roles.get("make-participant")
  const notice = roles.get("notify-user")
  return participant && notice ? { participant, notice } : null
}
