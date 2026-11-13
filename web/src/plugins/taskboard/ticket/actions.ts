// チケットのアクション。チケットを足す・直すは AI も行え、チケットを消す・ロックを外すは利用者だけ
import { type z, z as zod } from "zod"
import { byOf, READS_WORKROOM_NAMES, type Records, readsBy, recordIn, WORKROOM_SUBJECT } from "../by"
import { kit } from "../kit"
import { inDoneLane, NO_TAG, PROJECT, UNSORTED } from "../project"
import { type Project, projectOf } from "../project/actions"
import { PRIORITIES, PRIORITY_DEFAULT, TICKET, TICKET_NAME_MAX } from "."
import { ticketLabel } from "./label"
import { type Candidate, type Resolved, resolve } from "./resolve"

export type Ticket = z.output<typeof TICKET.record>

// アクションが読んだチケット（reads が id で答えた物）
export const ticketOf = (ctx: Records, id: string): Ticket | undefined =>
  recordIn(ctx, TICKET.id, id) as Ticket | undefined

// プロジェクトのレーン（未分類の行は除く）・チケットタグ・ワークルームの候補（id と名前）
const lanesOf = (project: Project): Candidate[] =>
  project.lanes.flatMap(l => (l.kind === "lane" ? [{ id: l.id, name: l.name }] : []))
const tagsOf = (project: Project): Candidate[] => project.tags.map(t => ({ id: t.id, name: t.name }))
// 読んだ索引キー（READS_WORKROOM_NAMES）から。作った順
const workroomsOf = (ctx: Records): Candidate[] =>
  Object.entries(ctx.keys?.[WORKROOM_SUBJECT] ?? {})
    .map(([id, keys]) => ({ id, name: String(keys.name ?? ""), createdAt: String(keys.createdAt ?? "") }))
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
  return found.id === current || project.tags.some(t => t.id === found.id && t.enabled)
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

// 完了のレーンへは、ticket-complete だけが入れる（担当を外す・今のチケットを空にする・チケット履歴を足すを一緒に行うため）
const DONE_LANE_REFUSAL = "the done lane is entered only with ticket-complete: complete the ticket"

export const TICKET_ADD = kit.defineAction({
  id: "ticket-add",
  title: "add ticket",
  aiDescription:
    "Add a ticket to the project (its id). name is up to 50 characters, body is markdown. lane is a lane of the project by its id or name (left out or the word unsorted: unsorted), tag is an enabled tag of the project by its id or name (left out or the word none: none), assignees are the workrooms by their ids or names, in order (the first is the main one; no workroom twice), priority is lowest, low, medium (the default), high or highest. The done lane of the project cannot be chosen (tickets get there with ticket-complete). A lane or tag that is named like the words unsorted or none is pointed at by its id. A refusal for a name that is not there lists the names and ids to choose from. Read the prompts of the lanes and the tags of the project (read_records) and follow them. Refused when the project is closed. Returns the ticket's id and number, the number with the prefix of the project as label (such as M-001), and the lane, the tag and the assignees as the ids they were taken for.",
  target: TICKET.id,
  reads: (args, actor) => [
    { subject: PROJECT.id, id: args.project },
    ...(args.assignees?.length ? [READS_WORKROOM_NAMES] : []),
    ...readsBy(actor),
  ],
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
    if (inDoneLane(project, lane.id)) return { declined: DONE_LANE_REFUSAL }
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
    "Change the name, the body, the priority, the lane, the tag or the assignees of the ticket named by on.record. assignees is the whole new list of workrooms by their ids or names, in order (the first is the main one; no workroom twice, each a workroom that is there; a workroom that was removed stays on the ticket until the list is changed). The same rules as ticket-add apply to the lane and the tag, by their ids or names; a ticket cannot be moved into the done lane here (use ticket-complete), and a ticket in the done lane takes no assignees until it is moved out (a tag that is not enabled any more can stay on the ticket). The project of a ticket does not change. The time of the last change moves only when something changed.",
  target: TICKET.id,
  // プロジェクトは、チケットが指す先なので書かない
  reads: args => (args.assignees?.length ? [READS_WORKROOM_NAMES] : []),
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
    if (lane && inDoneLane(project, lane.id) && !inDoneLane(project, now.lane)) return { declined: DONE_LANE_REFUSAL }
    const tag = args.tag === undefined ? undefined : pickTag(project, args.tag, now.tag)
    if (tag && "declined" in tag) return tag
    const assignees = args.assignees === undefined ? undefined : pickAssignees(ctx, args.assignees, now.assignees)
    if (assignees && "declined" in assignees) return assignees
    if (assignees && assignees.ids.length > 0 && inDoneLane(project, lane?.id ?? now.lane))
      return {
        declined:
          "a ticket in the done lane has no assignees: take it out of the done lane first (change its lane), then assign",
      }
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
  args: zod.strictObject({}),
  run: now => {
    if (now === "none" || !now.locked) return null
    const { locked: _, ...rest } = now
    return { next: rest, result: {} }
  },
})
