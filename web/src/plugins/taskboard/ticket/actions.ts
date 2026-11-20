// チケットのアクション。チケットを足す・直すは AI も行え、チケットを消す・ロックを外すは利用者だけ
import { z as zod } from "zod"
import { type Actor, type AIMessage, workroomOfActor } from "../../../plugin-api"
import { READS_WORKROOM_KEYS } from "../../base"
import { byOf, type Records, readsBy, recordIn, workroomsOf } from "../by"
import { kit } from "../kit"
import { inDoneLane, PROJECT, type Project, UNSORTED } from "../project"
import { projectOf } from "../project/actions"
import { ticketLabel } from "./label"
import { type Candidate, type Resolved, resolve } from "./resolve"
import { PRIORITIES, PRIORITY_DEFAULT, TICKET, TICKET_NAME_MAX, type Ticket, VOLUME_DEFAULT, VOLUMES } from "./ticket"

// アクションが読んだチケット（reads が id で答えた物）
export const ticketOf = (ctx: Records, id: string): Ticket | undefined =>
  recordIn(ctx, TICKET.id, id) as Ticket | undefined

// プロジェクトのレーン（未分類の行は除く）・チケットタグの候補（id と名前）
const lanesOf = (project: Project): Candidate[] =>
  project.lanes.flatMap(l => (l.kind === "lane" ? [{ id: l.id, name: l.name }] : []))
const tagCandidates = (project: Project): Candidate[] => project.tags.map(t => ({ id: t.id, name: t.name }))

// レーン ref（id か名前。未分類は予約の unsorted）を id に決める。今のレーン current と同じ id ならそのまま通す（消したレーンのままでもよい）
const pickLane = (project: Project, ref: string, current?: string): Resolved =>
  ref === current ? { id: ref } : resolve(ref, lanesOf(project), "lane", UNSORTED)

// 並び refs（id か名前）を id の並びに決める。今の並び current にある id はそのまま通す（消した物のままでもよい）。ほかは pick で 1 つずつ決め、同じ物を 2 回は断る（twice は断りの文）
function pickAll(
  refs: readonly string[],
  current: readonly string[],
  pick: (ref: string) => Resolved,
  twice: string,
): { ids: string[] } | { declined: string } {
  const ids: string[] = []
  for (const ref of refs) {
    const found = current.includes(ref) ? { id: ref } : pick(ref)
    if ("declined" in found) return found
    ids.push(found.id)
  }
  return new Set(ids).size === ids.length ? { ids } : { declined: twice }
}

// タグ refs を id の並びに決める。新しく付けられるのは有効なタグだけ（今付いているタグ current は、無効になっていても、名前で指しても通す）
const pickTags = (project: Project, refs: readonly string[], current: readonly string[]) =>
  pickAll(
    refs,
    current,
    ref => {
      const enabled = tagCandidates({ ...project, tags: project.tags.filter(t => t.enabled) })
      const found = resolve(ref, tagCandidates(project), "tag", undefined, enabled)
      if ("declined" in found) return found
      return current.includes(found.id) || enabled.some(t => t.id === found.id)
        ? found
        : { declined: `the tag "${ref}" is not enabled in the project` }
    },
    "a tag is there twice",
  )

// 担当 refs（ワークルームの id か名前の並び）を id の並びに決める（消したワークルームも、今の担当にあれば通す）
const pickAssignees = (ctx: Records, refs: readonly string[], current: readonly string[]) =>
  pickAll(refs, current, ref => resolve(ref, workroomsOf(ctx), "workroom"), "an assignee is there twice")

// 完了のレーンへは、ticket-complete だけが入れる（担当を外す・チケット履歴を足すを一緒に行うため）
const DONE_LANE_REFUSAL = "the done lane is entered only with ticket-complete: complete the ticket"

// 担当に新しく入ったワークルームの AI への知らせ（行う者がワークルームの AI のときだけ返せる。自分のワークルームには送らない。宛先に AI がいなければ送らないだけ）
function assignedMessages(
  actor: Actor,
  before: readonly string[],
  after: readonly string[],
  ticket: Ticket,
  project: Project,
): AIMessage[] {
  const own = workroomOfActor(actor)
  if (own === undefined) return []
  const label = ticketLabel(project.prefix, ticket.number)
  return after
    .filter(w => w !== own && !before.includes(w))
    .map(w => ({
      workroom: w,
      text: `Your workroom was assigned to the ticket ${label} "${ticket.name}" (${ticket.id})${
        after[0] === w ? " as its lead" : ""
      }.`,
      noRecipient: "skip" as const,
    }))
}

export const TICKET_ADD = kit.defineAction({
  id: "ticket-add",
  title: "add ticket",
  aiDescription:
    "Add a ticket to the project (its id). name is up to 50 characters, body is markdown. lane is a lane of the project by its id or name (left out or the word unsorted: unsorted), tags are enabled tags of the project by their ids or names (left out or empty: no tag; no tag twice), assignees are the workrooms by their ids or names, in order (the first is the lead; no workroom twice), priority is lowest, low, medium (the default), high or highest, volume (how much work it is) is xs, s, m, l or xl, or none (the default: not estimated yet). The done lane of the project cannot be chosen (tickets get there with ticket-complete). A lane that is named like the word unsorted is pointed at by its id. A refusal for a name that is not there lists the names and ids to choose from. Read the prompts of the lanes and the tags of the project (read_records) and follow them. Refused when the project is closed. A workroom other than yours that becomes an assignee is told by an AI message (matomezu sends it when an AI has joined that workroom; you do not). Returns the ticket's id and number, the number with the prefix of the project as label (such as M-0001), and the lane, the tags and the assignees as the ids they were taken for.",
  target: TICKET.id,
  reads: (args, actor) => [
    { subject: PROJECT.id, id: args.project },
    ...(args.assignees?.length ? [READS_WORKROOM_KEYS] : []),
    ...readsBy(actor),
  ],
  args: zod.strictObject({
    project: zod.string().min(1),
    name: zod.string().trim().min(1).max(TICKET_NAME_MAX),
    body: zod.string().optional(),
    lane: zod.string().min(1).optional(),
    tags: zod.array(zod.string().min(1)).optional(),
    assignees: zod.array(zod.string().min(1)).optional(),
    priority: zod.enum(PRIORITIES).optional(),
    volume: zod.enum(VOLUMES).optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const project = projectOf(ctx, args.project)
    if (!project) return { declined: "the project is not there" }
    const lane = pickLane(project, args.lane ?? UNSORTED)
    if ("declined" in lane) return lane
    if (inDoneLane(project, lane.id)) return { declined: DONE_LANE_REFUSAL }
    const tags = pickTags(project, args.tags ?? [], [])
    if ("declined" in tags) return tags
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
      priority: args.priority ?? PRIORITY_DEFAULT,
      volume: args.volume ?? VOLUME_DEFAULT,
      assignees: assignees.ids,
      createdAt: ctx.now,
      createdBy,
      updatedAt: ctx.now,
      tags: tags.ids,
    }
    const messages = assignedMessages(ctx.actor, [], ticket.assignees, ticket, project)
    return {
      next: ticket,
      ...(messages.length > 0 ? { aiMessages: messages } : {}),
      result: {
        ticket: ticket.id,
        number: ticket.number,
        label: ticketLabel(project.prefix, ticket.number),
        lane: ticket.lane,
        tags: ticket.tags,
        assignees: ticket.assignees,
      },
    }
  },
})

export const TICKET_UPDATE = kit.defineAction({
  id: "ticket-update",
  title: "update ticket",
  aiDescription:
    "Change the name, the body, the priority, the volume (as in ticket-add), the lane, the tags or the assignees of the ticket named by on.record. tags is the whole new list of tags (empty: no tag). assignees is the whole new list of workrooms by their ids or names, in order (the first is the lead; no workroom twice, each a workroom that is there; a workroom that was removed stays on the ticket until the list is changed). The same rules as ticket-add apply to the lane and the tags, by their ids or names; a ticket cannot be moved into the done lane here (use ticket-complete), and a ticket in the done lane takes no assignees until it is moved out (a tag that is not enabled any more, or was removed, can stay on the ticket until the list is changed). The project of a ticket does not change. The time of the last change moves only when something changed. A workroom other than yours that becomes an assignee is told by an AI message (matomezu sends it when an AI has joined that workroom; you do not).",
  target: TICKET.id,
  // プロジェクトは、チケットが指す先なので書かない
  reads: args => (args.assignees?.length ? [READS_WORKROOM_KEYS] : []),
  args: zod.strictObject({
    name: zod.string().trim().min(1).max(TICKET_NAME_MAX).optional(),
    body: zod.string().optional(),
    priority: zod.enum(PRIORITIES).optional(),
    volume: zod.enum(VOLUMES).optional(),
    lane: zod.string().min(1).optional(),
    tags: zod.array(zod.string().min(1)).optional(),
    assignees: zod.array(zod.string().min(1)).optional(),
  }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    const project = projectOf(ctx, now.project)
    if (!project) return { declined: "the project of the ticket is not there" }
    const lane = args.lane === undefined ? undefined : pickLane(project, args.lane, now.lane)
    if (lane && "declined" in lane) return lane
    if (lane && inDoneLane(project, lane.id) && !inDoneLane(project, now.lane)) return { declined: DONE_LANE_REFUSAL }
    const tags = args.tags === undefined ? undefined : pickTags(project, args.tags, now.tags)
    if (tags && "declined" in tags) return tags
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
      ...(args.volume === undefined ? {} : { volume: args.volume }),
      ...(lane === undefined ? {} : { lane: lane.id }),
      ...(tags === undefined ? {} : { tags: tags.ids }),
    }
    const changed = (Object.keys(next) as (keyof Ticket)[]).some(
      k => JSON.stringify(next[k]) !== JSON.stringify(now[k]),
    )
    if (!changed) return { next: now, result: {} }
    const messages = assignedMessages(ctx.actor, now.assignees, next.assignees, next, project)
    return {
      next: { ...next, updatedAt: ctx.now },
      ...(messages.length > 0 ? { aiMessages: messages } : {}),
      result: {},
    }
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
