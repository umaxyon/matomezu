// 書いた者（チケットを作った者・履歴の行を書いた者）: アクターをそのまま写した形。AI は入っているワークルームの、その時の名前・鳥・配色の写しを持つ
// （ワークルームを消しても、行の鳥が描ける）。鳥と配色の id は、タスクボードは意味を知らず、そのまま持つ
import { z } from "zod"
import { type Actor, isAI, type RecordOf } from "../../plugin-api"

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

type Records = { records?: Readonly<Record<string, Readonly<Record<string, unknown>>>> }

export const workroomOf = (ctx: Records, id: string) =>
  ctx.records?.[WORKROOM_SUBJECT]?.[id] as RecordOf<typeof WORKROOM_SUBJECT> | undefined

// 行った者を写す。入っているワークルームを確かめられない AI は null（参加が確定していない AI は、ブックでない対象のアクションを断られるので来ない）
export function byOf(actor: Actor, ctx: Records): By | null {
  if (!isAI(actor)) return { kind: "user" }
  if (actor.workroom === "none") return null
  const room = workroomOf(ctx, actor.workroom.id)
  if (!room) return null
  return {
    kind: "ai",
    workroom: { id: room.id, name: room.name, bird: room.bird, ...(room.palette ? { palette: room.palette } : {}) },
  }
}
