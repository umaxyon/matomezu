// プロジェクトのアクション。プロジェクトを作る・閉じる・開け直すは AI も行え、プロジェクトを直す（レーン・タグのプロンプトは AI への指示なので）は利用者だけ。
// プロジェクトを作るのは、最初の 1 度は常駐が初めて起動したときに行う（project-add の引数は省いてよい）
import { type z, z as zod } from "zod"
import { type Records, recordIn } from "../by"
import { kit } from "../kit"
import {
  LANE_NAME_MAX,
  LANES,
  NO_DONE_LANE,
  PREFIX,
  PROJECT,
  PROJECT_NAME_MAX,
  prefixKey,
  TAG,
  TAG_NAME_MAX,
  TAGS,
} from "."
import { projectNameOf, sayIn, templateOf } from "./template"

export type Project = z.output<typeof PROJECT.record>

// アクションが読んだプロジェクト（reads が id で答えた物か、宛先のチケットが指す先）
export const projectOf = (ctx: Records, id: string): Project | undefined =>
  recordIn(ctx, PROJECT.id, id) as Project | undefined

// チケットプレフィクス prefix と重なるプロジェクトの、索引キーだけを読む
const readsPrefix = (prefix: string) =>
  [{ subject: PROJECT.id, where: [{ key: "prefix", eq: prefixKey(prefix) }], keysOnly: true as const }] as const
// 読んだ中に、id が except でない、プレフィクスの重なるプロジェクトがあるか
const prefixTaken = (ctx: Records, except?: string) =>
  Object.keys(ctx.keys?.[PROJECT.id] ?? {}).some(id => id !== except)

const PREFIX_DEFAULT = "T-"

export const PROJECT_ADD = kit.defineAction({
  id: "project-add",
  title: "add project",
  aiDescription:
    "Add a project (a task board) with the lanes and the ticket tags of the template: to do, in progress and done, the tags task and bug, each with a prompt. name (up to 30 characters) and prefix (the head of the ticket numbers: 1 to 3 letters and at most one hyphen at the end, such as T- or ABC; not the same as another project's, whatever the case) are optional when it is the first project. Returns the project's id, its prefix, and its lanes and tags as {id, name} (point at a lane or tag by its id or name; a lane or tag named like the reserved unsorted or none is pointed at by its id).",
  target: PROJECT.id,
  reads: args => readsPrefix(args.prefix ?? PREFIX_DEFAULT),
  runsOnceAtStart: true,
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(PROJECT_NAME_MAX).optional(),
    prefix: PREFIX.optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const prefix = args.prefix ?? PREFIX_DEFAULT
    if (prefixTaken(ctx)) return { declined: `a project has the prefix ${prefix} already: give another prefix` }
    const say = sayIn(ctx.catalog.messages, ctx.lang)
    const project: Project = {
      id: ctx.newId(),
      name: args.name ?? projectNameOf(say),
      prefix,
      closed: false,
      ...templateOf(say, ctx.newId),
    }
    const lanes = project.lanes.flatMap(l => (l.kind === "lane" ? [{ id: l.id, name: l.name }] : []))
    const tags = project.tags.map(t => ({ id: t.id, name: t.name }))
    return { next: project, result: { project: project.id, prefix: project.prefix, lanes, tags } }
  },
})

const LANE_INPUT = zod.union([
  zod.strictObject({
    kind: zod.literal("lane"),
    id: zod.string().min(1).optional(),
    name: zod.string().trim().min(1).max(LANE_NAME_MAX),
    prompt: zod.string(),
  }),
  zod.strictObject({ kind: zod.literal("unsorted"), shown: zod.boolean() }),
])
const TAG_INPUT = TAG.extend({ id: zod.string().min(1).optional(), name: zod.string().trim().min(1).max(TAG_NAME_MAX) })

const TICKET_ID = kit.name("ticket")
const CURRENT_ID = kit.name("current-ticket")

// 完了のレーンを決める: 引数 ref が無ければ今のまま（新しいレーンの並びに無ければ none）、あれば none か、新しいレーンの並びの id か名前
function doneLaneOf(
  now: Project,
  ref: string | undefined,
  lanes: Project["lanes"],
): { id: string } | { declined: string } {
  const rows = lanes.flatMap(l => (l.kind === "lane" ? [l] : []))
  if (ref === undefined) return { id: rows.find(l => l.id === now.doneLane)?.id ?? NO_DONE_LANE }
  if (ref === NO_DONE_LANE) return { id: NO_DONE_LANE }
  const hit =
    rows.find(l => l.id === ref) ??
    (rows.filter(l => l.name === ref).length === 1 ? rows.find(l => l.name === ref) : undefined)
  return hit
    ? { id: hit.id }
    : { declined: `the done lane "${ref}" is not a lane of the project: give a lane's id or name, or none` }
}

export const PROJECT_UPDATE = kit.defineAction({
  id: "project-update",
  title: "update project",
  aiDescription:
    "Change the name, the prefix (as in project-add), the lanes, the ticket tags or the done lane (doneLane: a lane of the new lanes by its id or name, or none; refused while a ticket in that lane has assignees or is a current ticket) of the project named by on.record (only the user, because the prompts of the lanes and the tags tell you how to work; refused while the project is closed). lanes and tags are the whole new lists: a row with an id keeps that lane or tag, a row without an id is new. A lane or tag left out is removed; the tickets keep it and read as unsorted or none.",
  target: PROJECT.id,
  // 完了のレーンを選ぶときは、そのレーンのチケットと今のチケットを確かめるために、プロジェクトのチケットと今のチケットの索引キーを読む
  // （project は ticket・current-ticket を読まない向きなので、id だけを書く）
  reads: (args, _actor, on) => [
    ...(args.prefix === undefined ? [] : readsPrefix(args.prefix)),
    ...(args.doneLane === undefined || on === undefined
      ? []
      : [
          { subject: TICKET_ID, where: [{ key: "project" as const, eq: on }], keysOnly: true as const },
          { subject: CURRENT_ID, where: [], keysOnly: true as const },
        ]),
  ],
  userOnly: true,
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(PROJECT_NAME_MAX).optional(),
    prefix: PREFIX.optional(),
    lanes: zod.array(LANE_INPUT).optional(),
    tags: zod.array(TAG_INPUT).optional(),
    doneLane: zod.string().min(1).optional(),
  }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    if (args.prefix !== undefined && prefixTaken(ctx, now.id))
      return { declined: `a project has the prefix ${args.prefix} already` }
    const knownLanes = new Set(now.lanes.flatMap(l => (l.kind === "lane" ? [l.id] : [])))
    if (args.lanes?.some(l => l.kind === "lane" && l.id !== undefined && !knownLanes.has(l.id)))
      return { declined: "a lane has an id that is not in the project: leave the id out to make a new lane" }
    const knownTags = new Set(now.tags.map(t => t.id))
    if (args.tags?.some(t => t.id !== undefined && !knownTags.has(t.id)))
      return { declined: "a tag has an id that is not in the project: leave the id out to make a new tag" }
    const lanes = args.lanes?.map(l => (l.kind === "lane" ? { ...l, id: l.id ?? ctx.newId() } : l))
    const tags = args.tags?.map(t => ({ ...t, id: t.id ?? ctx.newId() }))
    if (lanes && !LANES.safeParse(lanes).success)
      return { declined: "the lanes need exactly one unsorted row, and the lane ids and names must not repeat" }
    if (tags && !TAGS.safeParse(tags).success) return { declined: "the tag ids and names must not repeat" }
    const done = doneLaneOf(now, args.doneLane, (lanes ?? now.lanes) as Project["lanes"])
    if ("declined" in done) return done
    if (done.id !== (now.doneLane ?? NO_DONE_LANE) && done.id !== NO_DONE_LANE) {
      // 新しい完了のレーンにいるチケットは、担当がおらず、今のチケットに指されていない
      const inLane = Object.entries(ctx.keys?.[TICKET_ID] ?? {}).filter(([, k]) => k.lane === done.id)
      if (inLane.some(([, k]) => Number(k.assigned ?? 0) > 0))
        return { declined: "tickets in that lane have assignees: complete them with ticket-complete first" }
      const ids = new Set(inLane.map(([id]) => id))
      if (Object.values(ctx.keys?.[CURRENT_ID] ?? {}).some(k => ids.has(String(k.ticket))))
        return {
          declined: "tickets in that lane are a current ticket of a workroom: complete them with ticket-complete first",
        }
    }
    const { doneLane: _was, ...kept } = now
    return {
      next: {
        ...kept,
        ...(args.name === undefined ? {} : { name: args.name }),
        ...(args.prefix === undefined ? {} : { prefix: args.prefix }),
        ...(lanes === undefined ? {} : { lanes: lanes as Project["lanes"] }),
        ...(tags === undefined ? {} : { tags: tags as Project["tags"] }),
        ...(done.id === NO_DONE_LANE ? {} : { doneLane: done.id }),
      },
      result: {},
    }
  },
})

export const PROJECT_CLOSE = kit.defineAction({
  id: "project-close",
  title: "close project",
  aiDescription:
    "Close the project named by on.record (when the user asks you to): no ticket can be added to it and the project cannot be changed until it is reopened, but its tickets can still be changed.",
  target: PROJECT.id,
  args: zod.strictObject({}),
  run: now => (now === "none" || now.closed ? null : { next: { ...now, closed: true }, result: {} }),
})

export const PROJECT_REOPEN = kit.defineAction({
  id: "project-reopen",
  title: "reopen project",
  aiDescription: "Reopen the closed project named by on.record (when the user asks you to).",
  target: PROJECT.id,
  args: zod.strictObject({}),
  run: now => (now === "none" || !now.closed ? null : { next: { ...now, closed: false }, result: {} }),
})
