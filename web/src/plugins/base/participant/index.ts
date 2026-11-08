// 参加者: AI のセッションがワークルームに入るための記録。参加者の表は利用者に 1 つで、ブックのデータとは別に持つ（core/participant.ts）。
// 要求する participant-request は AI も行え、受け入れる participant-accept と断る participant-decline は利用者だけ。
// 受け入れるときにワークルームの名前と鳥と配色を 1 度に決める（名前だけ・鳥だけの途中の状態は無い）
import { z } from "zod"
import { freshId } from "../../../core/ids"
import type { Participant, Participants } from "../../../core/participant"
import { declineProjects, unknownProjects } from "../../../core/project"
import { BIRD_IDS } from "../birds"
import { BIRD_PALETTES } from "../birds/colors"
import { kit } from "../kit"

// 参加者の表に残す、いちばん多い数。超えたら、受け入れていない要求のうち古い物から消す（受け入れていない要求が無ければ、要求を断る）
export const PARTICIPANTS_LIMIT = 100

const ID_ARGS = z.strictObject({ participant: z.string().min(1) })

const PALETTE_IDS = BIRD_PALETTES.map(p => p.id) as [string, ...string[]]

// 参加者の表 participants に 1 人足した並び（上限を超えるなら、受け入れていない要求の古い物から消す。足せなければ null）
function withinLimit(participants: Participants, added: Participant): Participants | null {
  let over = participants.length + 1 - PARTICIPANTS_LIMIT
  if (over <= 0) return [...participants, added]
  const drop = new Set<string>()
  for (const p of participants) {
    if (over <= 0) break
    if (p.state === "requested") {
      drop.add(p.id)
      over--
    }
  }
  return over > 0 ? null : [...participants.filter(p => !drop.has(p.id)), added]
}

export const PARTICIPANT_REQUEST = kit.defineAction({
  id: "participant-request",
  aiDescription:
    "Ask to join the user's workroom as a participant. ai (your AI name, such as claude or codex), model, env (the environment name) and link (a one-time passphrase uuid you made for this session) and projects (the ids of the projects to join, one or more) are required; sessionName (the name of the original session) is optional; workroom (a workroom name to start with) and takeover (the id of a joined participant whose workroom this one takes over) are optional. The participant waits as requested until the user accepts it on the screen. Sending the same link again adds the projects it does not have yet and returns the same participant. Returns the participant's id.",
  title: "Request to participate",
  target: "participants",
  runsWhenAIJoins: "make-participant",
  args: z.strictObject({
    ai: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(80),
    env: z.string().trim().min(1).max(80),
    sessionName: z.string().trim().max(120).optional(),
    link: z.string().trim().min(1).max(80),
    projects: z.array(z.string().min(1)).min(1),
    workroom: z.string().trim().min(1).max(40).optional(),
    takeover: z.string().min(1).optional(),
  }),
  run: (participants, args, ctx) => {
    const unknown = unknownProjects(args.projects)
    if (unknown.length > 0) return declineProjects(unknown)
    if (args.takeover && !participants.some(p => p.id === args.takeover && p.state === "joined"))
      return { declined: "there is no joined participant to take over" }
    const projects = [...new Set(args.projects)]
    const same = participants.find(p => p.link === args.link)
    if (same) {
      const added = projects.filter(id => !same.projects.includes(id))
      if (added.length === 0) return { next: participants, result: { participant: same.id } }
      const grown: Participant = { ...same, projects: [...same.projects, ...added] }
      return { next: participants.map(p => (p === same ? grown : p)), result: { participant: same.id } }
    }
    const id = freshId(
      ctx.newId,
      participants.map(p => p.id),
    )
    const requested: Participant = {
      id,
      state: "requested",
      ai: args.ai,
      model: args.model,
      env: args.env,
      sessionName: args.sessionName ?? "",
      link: args.link,
      projects,
      ...(args.workroom ? { workroom: args.workroom } : {}),
      ...(args.takeover ? { takeover: args.takeover } : {}),
      requestedAt: ctx.now,
    }
    const next = withinLimit(participants, requested)
    return next
      ? { next, result: { participant: id } }
      : { declined: "the participants table is full of accepted participants" }
  },
})

export const PARTICIPANT_ACCEPT = kit.defineAction({
  id: "participant-accept",
  aiDescription:
    "Accept a requested participant, naming the workroom and choosing the bird and its palette (only the user). Refused unless the participant is requested.",
  title: "Accept a participant",
  target: "participants",
  userOnly: true,
  args: ID_ARGS.extend({
    workroom: z.string().trim().min(1).max(40),
    bird: z.enum(BIRD_IDS),
    palette: z.enum(PALETTE_IDS).optional(),
  }),
  run: (participants, args, ctx) => {
    const found = participants.find(p => p.id === args.participant)
    if (found?.state !== "requested" || found.takeover) return null
    const joined: Participant = {
      ...found,
      state: "joined",
      workroom: args.workroom,
      joinedAt: ctx.now,
      bird: args.bird,
      ...(args.palette ? { palette: args.palette } : {}),
    }
    return { next: participants.map(p => (p === found ? joined : p)), result: {} }
  },
})

export const PARTICIPANT_TAKE_OVER = kit.defineAction({
  id: "participant-take-over",
  aiDescription:
    "Accept a requested participant that asks to take over the workroom of a joined participant (only the user). The requested one gets the workroom's name, bird and palette in the place of the old participant, who is removed. Refused unless the participant is a requested takeover and the participant it takes over is still joined.",
  title: "Accept a takeover",
  target: "participants",
  userOnly: true,
  args: ID_ARGS,
  run: (participants, args, ctx) => {
    const found = participants.find(p => p.id === args.participant)
    if (found?.state !== "requested" || !found.takeover) return null
    const old = participants.find(p => p.id === found.takeover && p.state === "joined")
    if (!old?.workroom) return null
    const { takeover: _, ...rest } = found
    const joined: Participant = {
      ...rest,
      state: "joined",
      workroom: old.workroom,
      joinedAt: ctx.now,
      ...(old.bird ? { bird: old.bird } : {}),
      ...(old.palette ? { palette: old.palette } : {}),
    }
    return { next: participants.flatMap(p => (p === old ? [joined] : p === found ? [] : [p])), result: {} }
  },
})

export const PARTICIPANT_DECLINE = kit.defineAction({
  id: "participant-decline",
  aiDescription:
    "Decline a requested participant and remove it from the table (only the user). Refused unless the participant is requested.",
  title: "Decline a participant",
  target: "participants",
  userOnly: true,
  args: ID_ARGS,
  run: (participants, args) => {
    const found = participants.find(p => p.id === args.participant)
    if (found?.state !== "requested") return null
    return { next: participants.filter(p => p !== found), result: {} }
  },
})
