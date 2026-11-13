// タスクボードのアクション（どれも 1 件のレコードを変える）。プロジェクトを作る・チケットを足す・直すは AI も行え、
// プロジェクトを直す（レーン・タグのプロンプトは AI への指示なので）・チケットを消すは利用者だけ。閉じる・開け直すは AI も行える（利用者が AI に頼む）。
// プロジェクトを作るのは、最初の 1 度は常駐が初めて起動したときに行う（project-add の引数は省いてよい）
import { type z, z as zod } from "zod"
import { enumValuesOf, isAI } from "../../plugin-api"
import { byOf, WORKROOM_SUBJECT } from "./by"
import { CURRENT, NO_TICKET } from "./current"
import { HISTORY, HISTORY_TOPIC, type TopicData } from "./history"
import { kit } from "./kit"
import {
  LANE_NAME_MAX,
  LANES,
  NO_TAG,
  PREFIX,
  PROJECT,
  PROJECT_NAME_MAX,
  sameName,
  TAG,
  TAG_NAME_MAX,
  TAGS,
  UNSORTED,
} from "./project"
import { type Candidate, type Resolved, resolve } from "./resolve"
import { projectNameOf, sayIn, templateOf } from "./template"
import { PRIORITIES, PRIORITY_DEFAULT, TICKET, TICKET_NAME_MAX } from "./ticket"
import { ticketLabel } from "./ticket-view"

type Project = z.output<typeof PROJECT.record>
type Ticket = z.output<typeof TICKET.record>
type Records = { records?: Readonly<Record<string, Readonly<Record<string, unknown>>>> }

const ticketsIn = (ctx: Records) => Object.values(ctx.records?.[TICKET.id] ?? {}) as Ticket[]
const projectsIn = (ctx: Records) => Object.values(ctx.records?.[PROJECT.id] ?? {}) as Project[]

export const PROJECT_ADD = kit.defineAction({
  id: "project-add",
  title: "add project",
  aiDescription:
    "Add a project (a task board) with the lanes and the ticket tags of the template: to do, in progress and done, the tags task and bug, each with a prompt. name (up to 30 characters) and prefix (the head of the ticket numbers: 1 to 3 letters and at most one hyphen at the end, such as T- or ABC; not the same as another project's, whatever the case) are optional when it is the first project. Returns the project's id, its prefix, and its lanes and tags as {id, name} (point at a lane or tag by its id or name; a lane or tag named like the reserved unsorted or none is pointed at by its id).",
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
    if (projectsIn(ctx).some(p => sameName(p.prefix, prefix, true)))
      return { declined: `a project has the prefix ${prefix} already: give another prefix` }
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
      projectsIn(ctx).some(p => p.id !== now.id && sameName(p.prefix, args.prefix as string, true))
    )
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

const projectOf = (ctx: Records, id: string): Project | undefined => projectsIn(ctx).find(p => p.id === id)

// プロジェクトのレーン（未分類の行は除く）・チケットタグ・ワークルームの候補（id と名前）
const lanesOf = (project: Project): Candidate[] =>
  project.lanes.flatMap(l => (l.kind === "lane" ? [{ id: l.id, name: l.name }] : []))
const tagsOf = (project: Project): Candidate[] => project.tags.map(t => ({ id: t.id, name: t.name }))
const workroomsOf = (ctx: Records): Candidate[] =>
  (Object.values(ctx.records?.[WORKROOM_SUBJECT] ?? {}) as { id: string; name: string; createdAt: string }[])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map(w => ({ id: w.id, name: w.name }))

// レーン ref（id か名前。未分類は予約の unsorted）を id に決める。今のレーン current と同じ id ならそのまま通す（消したレーンのままでもよい）
const pickLane = (project: Project, ref: string, current?: string): Resolved =>
  ref === current ? { id: ref } : resolve(ref, lanesOf(project), "lane", UNSORTED)

// タグ ref（id か名前。タグなしは予約の none）を id に決める。使えるのは有効なタグだけ（今のタグ current のままならよい）
function pickTag(project: Project, ref: string, current?: string): Resolved {
  if (ref === current) return { id: ref }
  const found = resolve(
    ref,
    tagsOf(project),
    "tag",
    NO_TAG,
    tagsOf({ ...project, tags: project.tags.filter(t => t.enabled) }),
  )
  if ("declined" in found || found.id === NO_TAG) return found
  return project.tags.some(t => t.id === found.id && t.enabled)
    ? found
    : { declined: `the tag "${ref}" is not enabled in the project` }
}

// 担当 refs（ワークルームの id か名前の並び）を id の並びに決める。今の担当 current にある id はそのまま通す（消したワークルームのままでもよい）。同じワークルームを 2 回は断る
function pickAssignees(
  ctx: Records,
  refs: readonly string[],
  current: readonly string[],
): { ids: string[] } | { declined: string } {
  const rooms = workroomsOf(ctx)
  const ids: string[] = []
  for (const ref of refs) {
    const found = current.includes(ref) ? { id: ref } : resolve(ref, rooms, "workroom")
    if ("declined" in found) return found
    ids.push(found.id)
  }
  return new Set(ids).size === ids.length ? { ids } : { declined: "an assignee is there twice" }
}

export const TICKET_ADD = kit.defineAction({
  id: "ticket-add",
  title: "add ticket",
  aiDescription:
    "Add a ticket to the project (its id). name is up to 50 characters, body is markdown. lane is a lane of the project by its id or name (left out or the word unsorted: unsorted), tag is an enabled tag of the project by its id or name (left out or the word none: none), assignees are the workrooms by their ids or names, in order (the first is the main one; none twice), priority is lowest, low, medium (the default), high or highest. A lane or tag that is named like the words unsorted or none is pointed at by its id. A refusal for a name that is not there lists the names and ids to choose from. Read the prompts of the lanes and the tags of the project (read_records) and follow them. Refused when the project is closed. Returns the ticket's id and number, the number with the prefix of the project as label (such as M-001), and the lane, the tag and the assignees as the ids they were taken for.",
  target: TICKET.id,
  reads: [PROJECT.id, WORKROOM_SUBJECT],
  args: zod.strictObject({
    project: zod.string().min(1),
    name: zod.string().trim().min(1).max(TICKET_NAME_MAX),
    body: zod.string().optional(),
    lane: zod.string().min(1).optional(),
    tag: zod.string().min(1).optional(),
    assignees: zod.array(zod.string().min(1)).optional(),
    priority: zod.enum(PRIORITIES).optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const project = projectOf(ctx, args.project)
    if (!project) return { declined: "the project is not there" }
    const lane = pickLane(project, args.lane ?? UNSORTED)
    if ("declined" in lane) return lane
    const tag = pickTag(project, args.tag ?? NO_TAG)
    if ("declined" in tag) return tag
    const assignees = pickAssignees(ctx, args.assignees ?? [], [])
    if ("declined" in assignees) return assignees
    if (!ctx.number) return null
    const createdBy = byOf(ctx.actor, ctx)
    if (!createdBy) return { declined: "the workroom of the AI is not there" }
    const ticket: Ticket = {
      id: ctx.newId(),
      project: project.id,
      number: ctx.number(project.id),
      name: args.name,
      body: args.body ?? "",
      lane: lane.id,
      tag: tag.id,
      priority: args.priority ?? PRIORITY_DEFAULT,
      assignees: assignees.ids,
      createdAt: ctx.now,
      createdBy,
      updatedAt: ctx.now,
    }
    return {
      next: ticket,
      result: {
        ticket: ticket.id,
        number: ticket.number,
        label: ticketLabel(project.prefix, ticket.number),
        lane: ticket.lane,
        tag: ticket.tag,
        assignees: ticket.assignees,
      },
    }
  },
})

export const TICKET_UPDATE = kit.defineAction({
  id: "ticket-update",
  title: "update ticket",
  aiDescription:
    "Change the name, the body, the priority, the lane, the tag or the assignees of the ticket named by on.record. assignees is the whole new list of workrooms by their ids or names, in order (the first is the main one; none twice, each a workroom that is there; a workroom that was removed stays on the ticket until the list is changed). The same rules as ticket-add apply to the lane and the tag, by their ids or names (a tag that is not enabled any more can stay on the ticket). The project of a ticket does not change. The time of the last change moves only when something changed.",
  target: TICKET.id,
  reads: [PROJECT.id, WORKROOM_SUBJECT],
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(TICKET_NAME_MAX).optional(),
    body: zod.string().optional(),
    priority: zod.enum(PRIORITIES).optional(),
    lane: zod.string().min(1).optional(),
    tag: zod.string().min(1).optional(),
    assignees: zod.array(zod.string().min(1)).optional(),
  }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    const project = projectOf(ctx, now.project)
    if (!project) return { declined: "the project of the ticket is not there" }
    const lane = args.lane === undefined ? undefined : pickLane(project, args.lane, now.lane)
    if (lane && "declined" in lane) return lane
    const tag = args.tag === undefined ? undefined : pickTag(project, args.tag, now.tag)
    if (tag && "declined" in tag) return tag
    const assignees = args.assignees === undefined ? undefined : pickAssignees(ctx, args.assignees, now.assignees)
    if (assignees && "declined" in assignees) return assignees
    const next: Ticket = {
      ...now,
      ...(assignees === undefined ? {} : { assignees: assignees.ids }),
      ...(args.name === undefined ? {} : { name: args.name }),
      ...(args.body === undefined ? {} : { body: args.body }),
      ...(args.priority === undefined ? {} : { priority: args.priority }),
      ...(lane === undefined ? {} : { lane: lane.id }),
      ...(tag === undefined ? {} : { tag: tag.id }),
    }
    const changed = (Object.keys(next) as (keyof Ticket)[]).some(
      k => JSON.stringify(next[k]) !== JSON.stringify(now[k]),
    )
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

// チケットのロックを掛ける・外す（ロック中のチケットは、この 2 つのほかのアクションを断る。外せるのは利用者だけ）
export const TICKET_LOCK = kit.defineAction({
  id: "ticket-lock",
  title: "lock ticket",
  aiDescription:
    "Lock the ticket named by on.record: while locked it cannot be changed or removed (only the user can unlock it). Lines of its history can still be added.",
  lockSwitch: true,
  target: TICKET.id,
  reads: [PROJECT.id],
  args: zod.strictObject({}),
  run: now => (now === "none" || now.locked ? null : { next: { ...now, locked: true as const }, result: {} }),
})

export const TICKET_UNLOCK = kit.defineAction({
  id: "ticket-unlock",
  title: "unlock ticket",
  aiDescription: "Unlock the ticket named by on.record (only the user).",
  lockSwitch: true,
  userOnly: true,
  target: TICKET.id,
  reads: [PROJECT.id],
  args: zod.strictObject({}),
  run: now => {
    if (now === "none" || !now.locked) return null
    const { locked: _, ...rest } = now
    return { next: rest, result: {} }
  },
})

// 履歴の行を足す。書いた者は行った者（引数では受けない）。題は、列挙 history-topic の値の id
export const TICKET_HISTORY_ADD = kit.defineAction({
  id: "ticket-history-add",
  title: "add ticket history",
  aiDescription:
    "Add a line to the history of the ticket (its id): topic is the id of a value of the enum history-topic (the values are listed in the arguments), text is what to write (needed, except for a topic whose data says textless). The line records you (your workroom, as it is now) and the time. Lines cannot be changed or removed later. The ticket's own time of the last change does not move.",
  target: HISTORY.id,
  reads: [TICKET.id, WORKROOM_SUBJECT],
  args: zod.strictObject({ ticket: zod.string().min(1), topic: zod.string().min(1), text: zod.string() }),
  describeArgs: catalog => {
    const topics = enumValuesOf(catalog, HISTORY_TOPIC.id)
    const ids = topics.map(v => v.id) as [string, ...string[]]
    // 題の候補と、いつ選ぶかの説明（値の aiDescription）を、引数の説明に並べる
    const topic =
      ids.length > 0
        ? zod
            .enum(ids)
            .describe(
              topics
                .map(v => `${v.id}: ${v.aiDescription}${(v.data as TopicData).textless ? " (text may be empty)" : ""}`)
                .join("\n"),
            )
        : zod.string().min(1)
    return zod.strictObject({ ticket: zod.string().min(1), topic, text: zod.string() })
  },
  run: (now, args, ctx) => {
    if (now !== "none") return null
    if (!ticketsIn(ctx).some(t => t.id === args.ticket)) return { declined: "the ticket is not there" }
    const topic = enumValuesOf(ctx.catalog, HISTORY_TOPIC.id).find(v => v.id === args.topic)
    if (!topic) return { declined: "the topic is not a value of history-topic" }
    if (args.text.trim() === "" && !(topic.data as TopicData).textless) return { declined: "the topic needs a text" }
    const by = byOf(ctx.actor, ctx)
    if (!by) return { declined: "the workroom of the AI is not there" }
    const line: z.output<typeof HISTORY.record> = {
      id: ctx.newId(),
      ticket: args.ticket,
      topic: args.topic,
      text: args.text,
      at: ctx.now,
      by,
    }
    return { next: line, result: { line: line.id } }
  },
})

// AI が自分のワークルームの今のチケットを宣言する（表示のため）。最初は on を省き、2 回目からは on.record に自分のワークルームの id を書く
export const CURRENT_TICKET_SET = kit.defineAction({
  id: "current-ticket-set",
  title: "set current ticket",
  aiDescription:
    "Declare the ticket your workroom is working on now (only to be shown to the user; it decides nothing), or none when you work on none. Only an AI in a workroom, and only for its own workroom. The first time, leave on out; after that, set on.record to your workroom's id (the id this action returned as current).",
  target: CURRENT.id,
  reads: [TICKET.id, WORKROOM_SUBJECT],
  args: zod.strictObject({ ticket: zod.string().min(1) }),
  run: (now, args, ctx) => {
    if (!isAI(ctx.actor) || ctx.actor.workroom === "none")
      return { declined: "only an AI in a workroom declares its current ticket" }
    const id = ctx.actor.workroom.id
    if (now !== "none" && now.id !== id) return { declined: "a workroom declares only its own current ticket" }
    if (args.ticket !== NO_TICKET && !ticketsIn(ctx).some(t => t.id === args.ticket))
      return { declined: "the ticket is not there" }
    return { next: { id, ticket: args.ticket, at: ctx.now }, result: { current: id } }
  },
})
