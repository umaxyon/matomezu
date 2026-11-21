// カレントワークのアクション: チケットを始める（ticket-start。カレントワークを取り替える）・チケットから抜ける（ticket-leave）。
// どちらもチケットが対象（チケットは番号を振る種類なので、ほかの種類のアクションからは書けない）で、カレントワークは others で書く。
// AI は自分のワークルームだけを動かす（workroom を受けない）。利用者は workroom でワークルームを選ぶ
import { z as zod } from "zod"
import { type Actor, isAI, workroomOfActor } from "../../../plugin-api"
import { READS_WORKROOM_KEYS } from "../../base"
import { type Records, workroomsOf } from "../by"
import { kit } from "../kit"
import { inDoneLane, inWorkingLane, type Project } from "../project"
import { projectOf } from "../project/actions"
import { TICKET, type Ticket } from "../ticket"
import { resolve } from "../ticket/resolve"
import { CURRENT_WORK, currentWorkChanges, currentWorkSet, currentWorksOf, NO_TICKET, READS_CURRENT_WORK } from "./work"

const WORKROOM_ARG = zod.string().min(1).optional()

// 動かすワークルーム: AI は自分のワークルーム（workroom を渡せば断る）、利用者は workroom（id か名前）
function workroomFor(actor: Actor, ref: string | undefined, ctx: Records): { id: string } | { declined: string } {
  if (isAI(actor)) {
    if (ref !== undefined) return { declined: "an AI works for its own workroom only: leave workroom out" }
    const own = workroomOfActor(actor)
    return own === undefined ? { declined: "the workroom of the AI is not there" } : { id: own }
  }
  if (ref === undefined) return { declined: "choose the workroom with workroom" }
  return resolve(ref, workroomsOf(ctx), "workroom")
}

// 利用者が workroom を名前で指せるように、ワークルームの索引キーも読む
const readsFor = (actor: Actor) => [READS_CURRENT_WORK, ...(isAI(actor) ? [] : [READS_WORKROOM_KEYS])]

// プロジェクトの最初の作業中のレーン（無ければ undefined）
const firstWorkingLane = (project: Project): string | undefined =>
  project.lanes.flatMap(l => (l.kind === "lane" && l.working === true ? [l.id] : []))[0]

export const TICKET_START = kit.defineAction({
  id: "ticket-start",
  title: "start ticket",
  aiDescription:
    "Make the ticket named by on.record your workroom's current ticket (the user names the workroom with workroom; an AI leaves it out). The ticket is moved to the first working lane of its project when it is not in a working lane, and your workroom is added to its assignees when it is not one of them. The ticket your workroom was working on before stays assigned to it, but is not its current ticket any more. You do not need this when your workroom gets its first current ticket: a workroom with no current ticket gets one by itself when it is assigned to a ticket in a working lane, or a ticket it is assigned to comes into one. Refused when the project has no working lane or the ticket is completed. Returns the workroom's id, the ticket it was working on before (or none) and the ticket's lane.",
  target: TICKET.id,
  writes: [CURRENT_WORK.id],
  reads: (_args, actor) => readsFor(actor),
  args: zod.strictObject({ workroom: WORKROOM_ARG }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    const project = projectOf(ctx, now.project)
    if (!project) return { declined: "the project of the ticket is not there" }
    if (inDoneLane(project, now.lane)) return { declined: "the ticket is completed" }
    const room = workroomFor(ctx.actor, args.workroom, ctx)
    if ("declined" in room) return room
    const lane = inWorkingLane(project, now.lane) ? now.lane : firstWorkingLane(project)
    if (lane === undefined)
      return { declined: "the project has no working lane: the user marks one in the project settings" }
    const works = currentWorksOf(ctx)
    const before = works.find(w => w.id === room.id)?.ticket ?? NO_TICKET
    const assignees = now.assignees.includes(room.id) ? now.assignees : [...now.assignees, room.id]
    const changed = lane !== now.lane || assignees !== now.assignees
    const next: Ticket = changed ? { ...now, lane, assignees, updatedAt: ctx.now } : now
    // ほかの担当のカレントワークの直し（作業中のレーンに入ったなど）と、このワークルームの取り替え
    const others = [
      ...currentWorkChanges(now, next, project, works).filter(o => o.id !== room.id),
      ...(before === now.id ? [] : [currentWorkSet(room.id, now.id)]),
    ]
    return {
      next,
      ...(others.length > 0 ? { others } : {}),
      result: { workroom: room.id, previous: before, lane },
    }
  },
})

export const TICKET_LEAVE = kit.defineAction({
  id: "ticket-leave",
  title: "leave ticket",
  aiDescription:
    "Stop working on the ticket named by on.record (the user names the workroom with workroom; an AI leaves it out): when it is your workroom's current ticket, your workroom has no current ticket any more. With unassign: true, your workroom is also taken off its assignees (do this when you helped on the ticket and your part is done; the lead leaves the ticket to be completed with ticket-complete instead). The ticket stays in its lane. Refused when the ticket is neither your workroom's current ticket nor assigned to it. Returns the workroom's id, whether it was the current ticket (left) and whether the workroom was taken off the assignees (unassigned).",
  target: TICKET.id,
  writes: [CURRENT_WORK.id],
  reads: (_args, actor) => readsFor(actor),
  args: zod.strictObject({ workroom: WORKROOM_ARG, unassign: zod.boolean().optional() }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    const room = workroomFor(ctx.actor, args.workroom, ctx)
    if ("declined" in room) return room
    const works = currentWorksOf(ctx)
    const left = works.some(w => w.id === room.id && w.ticket === now.id)
    const assigned = now.assignees.includes(room.id)
    if (!left && !assigned)
      return { declined: "the ticket is not the workroom's current ticket and not assigned to it" }
    const unassigned = args.unassign === true && assigned
    const next: Ticket = unassigned
      ? { ...now, assignees: now.assignees.filter(w => w !== room.id), updatedAt: ctx.now }
      : now
    const others = [
      ...currentWorkChanges(now, next, projectOf(ctx, now.project), works).filter(o => o.id !== room.id),
      ...(left ? [currentWorkSet(room.id, NO_TICKET)] : []),
    ]
    return {
      next,
      ...(others.length > 0 ? { others } : {}),
      result: { workroom: room.id, left, unassigned },
    }
  },
})
