// 参加者: AI のセッションがワークルームに入るための記録。参加者の表は利用者に 1 つで、ブックのデータとは別に持つ（core/participant.ts）。
// 要求する participant-request は AI も行え、受け入れる participant-accept と断る participant-decline は利用者だけ。
// 受け入れるときにワークルームの名前と鳥と配色を 1 度に決める（名前だけ・鳥だけの途中の状態は無い）
import { z } from "zod"
import { freshId } from "../../../core/ids"
import { type Participant, type Participants, WORKROOM_NAME_MAX } from "../../../core/participant"
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

// 参加を利用者に伝える文の鍵（常駐が話しかけのフックで使う）
export const JOINED_MESSAGE = kit.message("Joined matomezu. Workroom name: {name}")

export const PARTICIPANT_REQUEST = kit.defineAction({
  id: "participant-request",
  aiDescription:
    "Ask to join the user's workroom as a participant. ai (your AI name, such as claude or codex), model, env (the environment name) and link (a one-time passphrase uuid you made for this session) are required; sessionName (the name of the original session) is optional; workroom (a workroom name to start with, up to 20 characters) is optional. The participant waits as requested until the user accepts it on the screen. Sending the same link again returns the same participant. Returns the participant's id.",
  title: "Request to participate",
  target: "participants",
  runsWhenAIJoins: "make-participant",
  args: z.strictObject({
    ai: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(80),
    env: z.string().trim().min(1).max(80),
    sessionName: z.string().trim().max(120).optional(),
    link: z.string().trim().min(1).max(80),
    workroom: z.string().trim().min(1).max(WORKROOM_NAME_MAX).optional(),
  }),
  run: (participants, args, ctx) => {
    const same = participants.find(p => p.link === args.link)
    if (same) return { next: participants, result: { participant: same.id } }
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
      ...(args.workroom ? { workroom: args.workroom } : {}),
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
    "Accept a requested participant, naming the workroom (up to 20 characters) and choosing the bird and its palette (only the user). Refused unless the participant is requested, or when a joined participant already has the workroom's name. With replace (the id of the joined participant that has that name), that participant is removed and the new one starts in its place.",
  title: "Accept a participant",
  target: "participants",
  userOnly: true,
  args: ID_ARGS.extend({
    workroom: z.string().trim().min(1).max(WORKROOM_NAME_MAX),
    bird: z.enum(BIRD_IDS),
    palette: z.enum(PALETTE_IDS).optional(),
    replace: z.string().min(1).optional(),
  }),
  run: (participants, args, ctx) => {
    const found = participants.find(p => p.id === args.participant)
    if (found?.state !== "requested") return null
    const old = args.replace === undefined ? undefined : joinedBy(participants, args.replace)
    if (args.replace !== undefined && old?.workroom !== args.workroom) return null
    if (!old && participants.some(p => p.state === "joined" && p.workroom === args.workroom))
      return { declined: "a joined participant already has the workroom's name" }
    const joined: Participant = {
      ...found,
      state: "joined",
      workroom: args.workroom,
      joinedAt: ctx.now,
      bird: args.bird,
      ...(args.palette ? { palette: args.palette } : {}),
    }
    return { next: put(participants, found, old, joined), result: {} }
  },
})

// 受け入れ済みの参加者 id（受け入れ済みでなければ無い）
const joinedBy = (participants: Participants, id: string) => participants.find(p => p.id === id && p.state === "joined")

// 要求 found を受け入れた参加者 joined にする。外す参加者 old があれば、その場所に置いて old を外し、無ければ found の場所に置く
const put = (participants: Participants, found: Participant, old: Participant | undefined, joined: Participant) =>
  old
    ? participants.flatMap(p => (p === old ? [joined] : p === found ? [] : [p]))
    : participants.map(p => (p === found ? joined : p))

export const PARTICIPANT_TAKE_OVER = kit.defineAction({
  id: "participant-take-over",
  aiDescription:
    "Accept a requested participant by taking over the workroom of a joined participant (only the user). The requested one gets the workroom's name, bird and palette in the place of the old participant, who is removed. takeover is the joined participant's id. Refused unless the participant is requested and the participant it takes over is joined.",
  title: "Accept by taking over",
  target: "participants",
  userOnly: true,
  args: ID_ARGS.extend({ takeover: z.string().min(1) }),
  run: (participants, args, ctx) => {
    const found = participants.find(p => p.id === args.participant)
    if (found?.state !== "requested") return null
    const old = joinedBy(participants, args.takeover)
    if (!old?.workroom) return null
    const joined: Participant = {
      ...found,
      state: "joined",
      workroom: old.workroom,
      joinedAt: ctx.now,
      ...(old.bird ? { bird: old.bird } : {}),
      ...(old.palette ? { palette: old.palette } : {}),
    }
    return { next: put(participants, found, old, joined), result: {} }
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
