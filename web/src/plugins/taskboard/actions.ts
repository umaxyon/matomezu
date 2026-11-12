// タスクボードのアクション（どれも 1 件のレコードを変える）。プロジェクトを作る・チケットを足す・直すは AI も行え、
// プロジェクトを直す（レーン・タグのプロンプトは AI への指示なので）・閉じる・開け直す・チケットを消すは利用者だけ。
// プロジェクトを作るのは、最初の 1 度は常駐が初めて起動したときに行う（project-add の引数は省いてよい）
import { type z, z as zod } from "zod"
import { kit } from "./kit"
import { LANE_NAME_MAX, LANES, NO_TAG, PREFIX, PROJECT, PROJECT_NAME_MAX, TAG, TAG_NAME_MAX, UNSORTED } from "./project"
import { projectNameOf, sayIn, templateOf } from "./template"
import { PRIORITIES, PRIORITY_DEFAULT, TICKET, TICKET_NAME_MAX } from "./ticket"

type Project = z.output<typeof PROJECT.record>
type Ticket = z.output<typeof TICKET.record>
type Records = { records?: Readonly<Record<string, Readonly<Record<string, unknown>>>> }

const projectsIn = (ctx: Records) => Object.values(ctx.records?.[PROJECT.id] ?? {}) as Project[]
const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export const PROJECT_ADD = kit.defineAction({
  id: "project-add",
  title: "add project",
  aiDescription:
    "Add a project (a task board) with the lanes and the ticket tags of the template: to do, in progress and done, the tags task and bug, each with a prompt. name (up to 30 characters) and prefix (the head of the ticket numbers: letters and hyphens, starting with a letter, such as T-; not the same as another project's, whatever the case) are optional when it is the first project. Returns the project's id.",
  target: PROJECT.id,
  reads: [PROJECT.id],
  runsOnceAtStart: true,
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(PROJECT_NAME_MAX).optional(),
    prefix: PREFIX.optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const prefix = args.prefix ?? "T-"
    if (projectsIn(ctx).some(p => sameText(p.prefix, prefix)))
      return { declined: `a project has the prefix ${prefix} already: give another prefix` }
    const say = sayIn(ctx.catalog.messages, ctx.lang)
    const project: Project = {
      id: ctx.newId(),
      name: args.name ?? projectNameOf(say),
      prefix,
      closed: false,
      ...templateOf(say, ctx.newId),
    }
    return { next: project, result: { project: project.id } }
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
    "Change the name, the prefix, the lanes or the ticket tags of the project named by on.record (only the user, because the prompts of the lanes and the tags tell you how to work). lanes and tags are the whole new lists: a row with an id keeps that lane or tag, a row without an id is new. A lane or tag left out is removed; the tickets keep it and read as unsorted or none.",
  target: PROJECT.id,
  reads: [PROJECT.id],
  userOnly: true,
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(PROJECT_NAME_MAX).optional(),
    prefix: PREFIX.optional(),
    lanes: zod.array(LANE_INPUT).optional(),
    tags: zod.array(TAG_INPUT).optional(),
  }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    if (
      args.prefix !== undefined &&
      projectsIn(ctx).some(p => p.id !== now.id && sameText(p.prefix, args.prefix as string))
    )
      return { declined: `a project has the prefix ${args.prefix} already` }
    const known = new Set(now.lanes.flatMap(l => (l.kind === "lane" ? [l.id] : [])))
    const lanes = args.lanes?.map(l => (l.kind === "lane" ? { ...l, id: l.id ?? ctx.newId() } : l))
    if (
      lanes?.some(
        l =>
          l.kind === "lane" &&
          l.id !== undefined &&
          !known.has(l.id) &&
          args.lanes?.some(i => i.kind === "lane" && i.id === l.id),
      )
    )
      return { declined: "a lane has an id that is not in the project: leave the id out to make a new lane" }
    const knownTags = new Set(now.tags.map(t => t.id))
    const tags = args.tags?.map(t => ({ ...t, id: t.id ?? ctx.newId() }))
    if (args.tags?.some(t => t.id !== undefined && !knownTags.has(t.id)))
      return { declined: "a tag has an id that is not in the project: leave the id out to make a new tag" }
    if (lanes && !LANES.safeParse(lanes).success)
      return { declined: "the lanes need exactly one unsorted row, and the lane ids and names must not repeat" }
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
    "Close the project named by on.record (only the user): no ticket can be added to it, but its tickets can still be changed.",
  target: PROJECT.id,
  userOnly: true,
  args: zod.strictObject({}),
  run: now => (now === "none" || now.closed ? null : { next: { ...now, closed: true }, result: {} }),
})

export const PROJECT_REOPEN = kit.defineAction({
  id: "project-reopen",
  title: "reopen project",
  aiDescription: "Reopen the closed project named by on.record (only the user).",
  target: PROJECT.id,
  userOnly: true,
  args: zod.strictObject({}),
  run: now => (now === "none" || !now.closed ? null : { next: { ...now, closed: false }, result: {} }),
})

const projectOf = (ctx: Records, id: string): Project | undefined => projectsIn(ctx).find(p => p.id === id)

// レーン lane（レーンの id か未分類）が、プロジェクトにあるか
const hasLane = (project: Project, lane: string) =>
  lane === UNSORTED || project.lanes.some(l => l.kind === "lane" && l.id === lane)

export const TICKET_ADD = kit.defineAction({
  id: "ticket-add",
  title: "add ticket",
  aiDescription:
    "Add a ticket to the project (its id). name is up to 50 characters, body is markdown. lane is a lane's id of the project (left out: unsorted), tag is a tag's id of the project that is enabled (left out: none), priority is lowest, low, medium (the default), high or highest. Read the prompts of the lanes and the tags of the project (read_records) and follow them. Refused when the project is closed. Returns the ticket's id and number.",
  target: TICKET.id,
  reads: [PROJECT.id],
  args: zod.strictObject({
    project: zod.string().min(1),
    name: zod.string().trim().min(1).max(TICKET_NAME_MAX),
    body: zod.string().optional(),
    lane: zod.string().min(1).optional(),
    tag: zod.string().min(1).optional(),
    priority: zod.enum(PRIORITIES).optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const project = projectOf(ctx, args.project)
    if (!project) return { declined: "the project is not there" }
    const lane = args.lane ?? UNSORTED
    if (!hasLane(project, lane)) return { declined: "the lane is not in the project" }
    const tag = args.tag ?? NO_TAG
    if (tag !== NO_TAG && !project.tags.some(t => t.id === tag && t.enabled))
      return { declined: "the tag is not in the project, or is not enabled" }
    if (!ctx.number) return null
    const ticket: Ticket = {
      id: ctx.newId(),
      project: project.id,
      number: ctx.number(project.id),
      name: args.name,
      body: args.body ?? "",
      lane,
      tag,
      priority: args.priority ?? PRIORITY_DEFAULT,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }
    return { next: ticket, result: { ticket: ticket.id, number: ticket.number } }
  },
})

export const TICKET_UPDATE = kit.defineAction({
  id: "ticket-update",
  title: "update ticket",
  aiDescription:
    "Change the name, the body, the priority, the lane or the tag of the ticket named by on.record. The same rules as ticket-add apply to the lane and the tag (a tag that is not enabled any more can stay on the ticket). The project of a ticket does not change. The time of the last change moves only when something changed.",
  target: TICKET.id,
  reads: [PROJECT.id],
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(TICKET_NAME_MAX).optional(),
    body: zod.string().optional(),
    priority: zod.enum(PRIORITIES).optional(),
    lane: zod.string().min(1).optional(),
    tag: zod.string().min(1).optional(),
  }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    const project = projectOf(ctx, now.project)
    if (!project) return { declined: "the project of the ticket is not there" }
    if (args.lane !== undefined && args.lane !== now.lane && !hasLane(project, args.lane))
      return { declined: "the lane is not in the project" }
    if (
      args.tag !== undefined &&
      args.tag !== now.tag &&
      args.tag !== NO_TAG &&
      !project.tags.some(t => t.id === args.tag && t.enabled)
    )
      return { declined: "the tag is not in the project, or is not enabled" }
    const next: Ticket = {
      ...now,
      ...(args.name === undefined ? {} : { name: args.name }),
      ...(args.body === undefined ? {} : { body: args.body }),
      ...(args.priority === undefined ? {} : { priority: args.priority }),
      ...(args.lane === undefined ? {} : { lane: args.lane }),
      ...(args.tag === undefined ? {} : { tag: args.tag }),
    }
    const changed = (Object.keys(next) as (keyof Ticket)[]).some(k => next[k] !== now[k])
    return { next: changed ? { ...next, updatedAt: ctx.now } : now, result: {} }
  },
})

export const TICKET_REMOVE = kit.defineAction({
  id: "ticket-remove",
  title: "remove ticket",
  aiDescription: "Remove the ticket named by on.record (only the user). Its number is not used again.",
  target: TICKET.id,
  reads: [PROJECT.id],
  userOnly: true,
  args: zod.strictObject({}),
  run: now => (now === "none" ? null : { next: "removed", result: {} }),
})
