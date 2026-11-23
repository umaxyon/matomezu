// 書いた者（チケットを作った者・履歴の行を書いた者）: アクターをそのまま写した形。AI は入っているワークルームの、その時の名前・鳥・配色の写しを持つ
// （ワークルームを消しても、行の鳥が描ける）。鳥と配色の id は、タスクボードは意味を知らず、そのまま持つ
import { z } from "zod"
import {
  type ActionContext,
  type Actor,
  isAI,
  NO_RECORD,
  NO_WORKROOM,
  type RecordOf,
  type RecordRead,
  workroomOfActor,
} from "../../plugin-api"

export const WORKROOM_SUBJECT = "@matomezu/base:workroom"

export const BY = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({
    kind: z.literal("ai"),
    workroom: z.strictObject({
      id: z.string().min(1),
      name: z.string(),
      bird: z.string(),
      palette: z.string().optional(),
    }),
  }),
])
export type By = z.output<typeof BY>

// アクションが読んだ物（reads が答えたレコードと索引キー、宛先のレコードが指す先を読む record）
export type Records = Pick<ActionContext, "records" | "keys" | "record">

// アクションが読んだ、種類 subject の id のレコード（reads が id で答えた物か、宛先のレコードが指す先。無ければ undefined）
export function recordIn(ctx: Records, subject: string, id: string): unknown | undefined {
  const read = ctx.records?.[subject]?.[id] ?? ctx.record?.(subject, id)
  return read === NO_RECORD ? undefined : read
}

export const workroomOf = (ctx: Records, id: string) =>
  recordIn(ctx, WORKROOM_SUBJECT, id) as RecordOf<typeof WORKROOM_SUBJECT> | undefined

// 書いた者を写す（byOf）アクションが読む物: 行う者が入っているワークルーム
export const readsBy = (actor: Actor): RecordRead[] => {
  const id = workroomOfActor(actor)
  return id === NO_WORKROOM ? [] : [{ subject: WORKROOM_SUBJECT, id }]
}

// ワークルームの候補（id と名前）: 読んだ全部のワークルームの索引キー（base の READS_WORKROOM_KEYS）から。作った順
export const workroomsOf = (ctx: Records): { id: string; name: string }[] =>
  Object.entries(ctx.keys?.[WORKROOM_SUBJECT] ?? {})
    .map(([id, keys]) => ({ id, name: String(keys.name ?? ""), createdAt: String(keys.createdAt ?? "") }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map(w => ({ id: w.id, name: w.name }))

// 行った者を写す。入っているワークルームを確かめられない AI は null（参加が確定していない AI とビジターは、参加を頼む役のほかのアクションを断られるので来ない）
export function byOf(actor: Actor, ctx: Records): By | null {
  if (!isAI(actor)) return { kind: "user" }
  const id = workroomOfActor(actor)
  if (id === NO_WORKROOM) return null
  const room = workroomOf(ctx, id)
  if (!room) return null
  return {
    kind: "ai",
    workroom: { id: room.id, name: room.name, bird: room.bird, ...(room.palette ? { palette: room.palette } : {}) },
  }
}
