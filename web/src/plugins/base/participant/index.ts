// 参加者・ワークルーム・管理者の印: 参加者リストのデータ（対象の定義。レコード）。
// ワークルームは名前・鳥・配色を持つ独立したデータ（id は振り直さない）。空室は、入っている参加者がいないワークルーム（ワークルームの側には持たない）。
// 参加者は AI のセッションが入る記録で、要求中（requested）か受け入れ済み（joined。入っているワークルームの id を持つ）。
// 管理者の印は全体に 1 つ（id は "admin"。ワークルームの id か "none"。どこからも読まない飾り）。指す先のワークルームが無ければ「無い」として読み、書き換えない。
// 要求する participant-request は AI も行え、ほかは利用者だけ。受け入れるときに、新しいワークルームなら先に workroom-add でワークルームを作り、participant-accept で入れる。
// 引き継ぎ・ワークルームを出る・ワークルームを消すは、アクションを 1 件ずつ続けて行う（join-flow.ts）
import { z } from "zod"
import { BIRD_IDS } from "../birds"
import { BIRD_PALETTES } from "../birds/colors"
import { kit } from "../kit"

export const WORKROOM_NAME_MAX = 20 // ワークルームの名前の長さの上限（字）

// 受け入れていない要求の、いちばん多い数。超えたら、要求を断る
export const PARTICIPANTS_LIMIT = 100

const PALETTE_IDS = BIRD_PALETTES.map(p => p.id) as [string, ...string[]]

export const WORKROOM = kit.defineSubject({
  id: "workroom",
  title: "workroom",
  aiDescription:
    "A workroom: a name (up to 20 characters, not repeated), a bird and its palette. A workroom with no participant in it is empty.",
  role: "workrooms",
  record: z.strictObject({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(WORKROOM_NAME_MAX),
    bird: z.enum(BIRD_IDS),
    palette: z.enum(PALETTE_IDS).optional(),
    createdAt: z.string(),
  }),
})

export const PARTICIPANT = kit.defineSubject({
  id: "participant",
  title: "participant",
  aiDescription:
    "A participant: an AI session that asked to join (requested) or was accepted into a workroom (joined, with the workroom's id).",
  role: "participants",
  record: z
    .strictObject({
      id: z.string().min(1),
      state: z.enum(["requested", "joined"]),
      ai: z.string(), // AI の名前（claude・codex など）
      model: z.string(),
      env: z.string(), // 環境名
      sessionName: z.string(), // 元のセッション名（空でもよい）
      link: z.string().min(1), // 使い捨ての合言葉（画面には出さない。同じ link の要求は 1 人にまとまる）
      wantedName: z.string().trim().min(1).max(WORKROOM_NAME_MAX).optional(), // 要求中が入りたいワークルームの名前
      workroom: z.string().min(1).optional(), // 入っているワークルームの id（受け入れ済みだけ）
      requestedAt: z.string(),
      joinedAt: z.string().optional(), // 受け入れた時点（受け入れ済みだけ）
    })
    .refine(p =>
      p.state === "joined"
        ? p.workroom !== undefined && p.joinedAt !== undefined && p.wantedName === undefined
        : p.workroom === undefined && p.joinedAt === undefined,
    ),
  refers: p => (p.workroom === undefined ? [] : [{ subject: WORKROOM.id, id: p.workroom }]),
})

export const ADMIN_MARK = kit.defineSubject({
  id: "admin-mark",
  title: "adminMark",
  aiDescription:
    "The administrator's mark: which workroom is the administrator (the id, or none). There is one, with the id admin.",
  record: z.strictObject({ id: z.string().min(1), workroom: z.string().min(1) }), // id は "admin"（admin-set が作る）
  refers: a => (a.workroom === "none" ? [] : [{ subject: WORKROOM.id, id: a.workroom }]),
})

// 参加を利用者に伝える文の鍵（常駐が話しかけのフックで使う）
export const JOINED_MESSAGE = kit.message("Joined matomezu. Workroom name: {name}")

// データの型（画面の見た目は、ここから読む）
export type Participant = z.output<typeof PARTICIPANT.record>
export type Workroom = z.output<typeof WORKROOM.record>
const participantsIn = (ctx: { records?: Readonly<Record<string, Readonly<Record<string, unknown>>>> }) =>
  Object.values(ctx.records?.[PARTICIPANT.id] ?? {}) as Participant[]
const workroomsIn = (ctx: { records?: Readonly<Record<string, Readonly<Record<string, unknown>>>> }) =>
  Object.values(ctx.records?.[WORKROOM.id] ?? {}) as Workroom[]

const BIRD_ARGS = { bird: z.enum(BIRD_IDS), palette: z.enum(PALETTE_IDS).optional() }
const NAME = z.string().trim().min(1).max(WORKROOM_NAME_MAX)

export const PARTICIPANT_REQUEST = kit.defineAction({
  id: "participant-request",
  aiDescription:
    "Ask to join the user's workroom as a participant. ai (your AI name, such as claude or codex), model, env (the environment name) and link (a one-time passphrase uuid you made for this session) are required; sessionName (the name of the original session) is optional; wantedName (a workroom name to start with, up to 20 characters) is optional. The participant waits as requested until the user accepts it on the screen. Refused when a participant has the link already, or when too many requests wait. Returns the participant's id.",
  title: "Request to participate",
  target: PARTICIPANT.id,
  reads: [PARTICIPANT.id],
  runsWhenAIJoins: "make-participant",
  args: z.strictObject({
    ai: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(80),
    env: z.string().trim().min(1).max(80),
    sessionName: z.string().trim().max(120).optional(),
    link: z.string().trim().min(1).max(80),
    wantedName: NAME.optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const all = participantsIn(ctx)
    if (all.some(p => p.link === args.link)) return { declined: "a participant has the link already" }
    if (all.filter(p => p.state === "requested").length >= PARTICIPANTS_LIMIT)
      return { declined: "too many requests are waiting for the user" }
    const requested: Participant = {
      id: ctx.newId(),
      state: "requested",
      ai: args.ai,
      model: args.model,
      env: args.env,
      sessionName: args.sessionName ?? "",
      link: args.link,
      ...(args.wantedName ? { wantedName: args.wantedName } : {}),
      requestedAt: ctx.now,
    }
    return { next: requested, result: { participant: requested.id } }
  },
})

export const PARTICIPANT_ACCEPT = kit.defineAction({
  id: "participant-accept",
  aiDescription:
    "Accept the requested participant named by on.record into a workroom (only the user). Refused unless the participant is requested, the workroom is there and has no participant in it.",
  title: "Accept a participant",
  target: PARTICIPANT.id,
  reads: [WORKROOM.id, PARTICIPANT.id],
  userOnly: true,
  args: z.strictObject({ workroom: z.string().min(1) }),
  run: (now, args, ctx) => {
    if (now === "none" || now.state !== "requested") return null
    if (!workroomsIn(ctx).some(w => w.id === args.workroom)) return { declined: "the workroom is not there" }
    if (participantsIn(ctx).some(p => p.workroom === args.workroom))
      return { declined: "a participant is in the workroom already" }
    const { wantedName: _, ...rest } = now
    return { next: { ...rest, state: "joined", workroom: args.workroom, joinedAt: ctx.now }, result: {} }
  },
})

export const PARTICIPANT_DECLINE = kit.defineAction({
  id: "participant-decline",
  aiDescription:
    "Decline the requested participant named by on.record and remove it (only the user). Refused unless it is requested.",
  title: "Decline a participant",
  target: PARTICIPANT.id,
  reads: [WORKROOM.id], // 参加者が指すワークルーム（refers）を引くため
  userOnly: true,
  args: z.strictObject({}),
  run: now => (now === "none" || now.state !== "requested" ? null : { next: "removed", result: {} }),
})

export const PARTICIPANT_REMOVE = kit.defineAction({
  id: "participant-remove",
  aiDescription:
    "Remove the joined participant named by on.record from its workroom (only the user). The workroom stays, empty.",
  title: "Remove a participant",
  target: PARTICIPANT.id,
  reads: [WORKROOM.id], // 参加者が指すワークルーム（refers）を引くため
  userOnly: true,
  args: z.strictObject({}),
  run: now => (now === "none" || now.state !== "joined" ? null : { next: "removed", result: {} }),
})

export const WORKROOM_ADD = kit.defineAction({
  id: "workroom-add",
  aiDescription:
    "Add an empty workroom with a name (up to 20 characters, not repeated), a bird and a palette (only the user). Returns the workroom's id.",
  title: "Add a workroom",
  target: WORKROOM.id,
  reads: [WORKROOM.id],
  userOnly: true,
  args: z.strictObject({ name: NAME, ...BIRD_ARGS }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    if (workroomsIn(ctx).some(w => w.name === args.name))
      return { declined: `a workroom named ${args.name} already exists` }
    const room: Workroom = {
      id: ctx.newId(),
      name: args.name,
      bird: args.bird,
      ...(args.palette ? { palette: args.palette } : {}),
      createdAt: ctx.now,
    }
    return { next: room, result: { workroom: room.id } }
  },
})

export const WORKROOM_UPDATE = kit.defineAction({
  id: "workroom-update",
  aiDescription:
    "Change the name, the bird or the palette of the workroom named by on.record (only the user). The name is not repeated.",
  title: "Change a workroom",
  target: WORKROOM.id,
  reads: [WORKROOM.id],
  userOnly: true,
  args: z.strictObject({ name: NAME.optional(), bird: BIRD_ARGS.bird.optional(), palette: BIRD_ARGS.palette }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    if (args.name !== undefined && workroomsIn(ctx).some(w => w.id !== now.id && w.name === args.name))
      return { declined: `a workroom named ${args.name} already exists` }
    return {
      next: {
        ...now,
        ...(args.name === undefined ? {} : { name: args.name }),
        ...(args.bird === undefined ? {} : { bird: args.bird }),
        ...(args.palette === undefined ? {} : { palette: args.palette }),
      },
      result: {},
    }
  },
})

export const WORKROOM_REMOVE = kit.defineAction({
  id: "workroom-remove",
  aiDescription:
    "Remove the workroom named by on.record (only the user). Refused while a participant is in it: remove the participant first.",
  title: "Remove a workroom",
  target: WORKROOM.id,
  reads: [PARTICIPANT.id],
  userOnly: true,
  args: z.strictObject({}),
  run: (now, _args, ctx) => {
    if (now === "none") return null
    if (participantsIn(ctx).some(p => p.workroom === now.id)) return { declined: "a participant is in the workroom" }
    return { next: "removed", result: {} }
  },
})

export const ADMIN_SET = kit.defineAction({
  id: "admin-set",
  aiDescription:
    "Set the administrator's mark to a workroom (its id) or to none (only the user). Without on it makes the mark.",
  title: "Set the administrator",
  target: ADMIN_MARK.id,
  reads: [WORKROOM.id],
  userOnly: true,
  args: z.strictObject({ workroom: z.string().min(1) }),
  run: (_now, args, ctx) => {
    if (args.workroom !== "none" && !workroomsIn(ctx).some(w => w.id === args.workroom))
      return { declined: "the workroom is not there" }
    return { next: { id: "admin", workroom: args.workroom }, result: {} }
  },
})
