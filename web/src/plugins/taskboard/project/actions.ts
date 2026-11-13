// プロジェクトのアクション。プロジェクトを作る・閉じる・開け直すは AI も行え、プロジェクトを直す（レーン・タグのプロンプトは AI への指示なので）は利用者だけ。
// プロジェクトを作るのは、最初の 1 度は常駐が初めて起動したときに行う（project-add の引数は省いてよい）
import { type z, z as zod } from "zod"
import { type Records, recordIn } from "../by"
import { kit } from "../kit"
import { LANE_NAME_MAX, LANES, PREFIX, PROJECT, PROJECT_NAME_MAX, prefixKey, TAG, TAG_NAME_MAX, TAGS } from "."
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

export const PROJECT_UPDATE = kit.defineAction({
  id: "project-update",
  title: "update project",
  aiDescription:
    "Change the name, the prefix (as in project-add), the lanes or the ticket tags of the project named by on.record (only the user, because the prompts of the lanes and the tags tell you how to work; refused while the project is closed). lanes and tags are the whole new lists: a row with an id keeps that lane or tag, a row without an id is new. A lane or tag left out is removed; the tickets keep it and read as unsorted or none.",
  target: PROJECT.id,
  reads: args => (args.prefix === undefined ? [] : readsPrefix(args.prefix)),
  userOnly: true,
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(PROJECT_NAME_MAX).optional(),
    prefix: PREFIX.optional(),
    lanes: zod.array(LANE_INPUT).optional(),
    tags: zod.array(TAG_INPUT).optional(),
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
    return {
      next: {
        ...now,
        ...(args.name === undefined ? {} : { name: args.name }),
        ...(args.prefix === undefined ? {} : { prefix: args.prefix }),
        ...(lanes === undefined ? {} : { lanes: lanes as Project["lanes"] }),
        ...(tags === undefined ? {} : { tags: tags as Project["tags"] }),
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
