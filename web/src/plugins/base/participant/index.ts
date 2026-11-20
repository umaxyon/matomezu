// 参加者・ワークルーム・管理者の印: 参加者リストのデータ（対象の定義。レコード）。
// ワークルームは名前・鳥・配色を持つ独立したデータ（id は振り直さない）。空室は、入っている参加者がいないワークルーム（ワークルームの側には持たない）。
// 参加者は AI のセッションが入る記録で、要求中（requested）か、受け入れ済みでワークルームに入っている（joined。そのワークルームの id を持つ）か、
// 受け入れ済みでワークルームを持たないビジター（visitor。読むことだけができる）。
// 管理者の印は全体に 1 つ（id は "admin"。ワークルームの id か "none"）。アクションは READS_ADMIN と READS_WORKROOM_KEYS で読み、adminWorkroom・isAdminActor で引く。
// 指す先のワークルームが無ければ「無い」として読む。書き換えるのは、管理者がいないときにワーカーを受け入れる participant-accept だけ。
// 要求する participant-request は AI も行え、ほかは利用者だけ。participant-accept は、入るワークルームを作る・いる参加者を外す・捨てるワークルームを消す・
// 管理者がいなければ入れたワークルームを管理者にする、まで 1 つのアクションで行う（ビジターとして受け入れるときは、ワークルームに触らない）。
// workroom-remove も、いる参加者を一緒に外す。外す参加者は id で渡し、渡した参加者がそのワークルームにいるときだけ外す（生きているかは、ダイアログが見る）
import { z } from "zod"
import { type Actor, workroomOfActor } from "../../../core/actor"
import type { SubjectId } from "../../../core/catalog"
import type { ActionContext, RecordRead } from "../../../core/def/action"
import { PARTICIPANT_STATES } from "../../../core/def/subject"
import type { KeyValuesOf } from "../../../core/record-keys"
import { BIRD_IDS } from "../birds"
import { BIRD_PALETTE_IDS } from "../birds/colors"
import { kit } from "../kit"
import { adminRoomOf } from "./rows"

export const WORKROOM_NAME_MAX = 20 // ワークルームの名前の長さの上限（字）

// 受け入れていない要求の、いちばん多い数。超えたら、要求を断る
export const PARTICIPANTS_LIMIT = 100

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
    palette: z.enum(BIRD_PALETTE_IDS).optional(),
    createdAt: z.string(),
  }),
  keys: {
    name: { type: "text", of: w => w.name },
    createdAt: { type: "text", of: w => w.createdAt },
  },
})

export const PARTICIPANT = kit.defineSubject({
  id: "participant",
  title: "participant",
  aiDescription:
    "A participant: an AI session that asked to join (requested; as is visitor when it asked to join only to read), was accepted into a workroom (joined, with the workroom's id), or was accepted as a visitor that only reads (visitor, with no workroom).",
  role: "participants",
  record: z
    .strictObject({
      id: z.string().min(1),
      state: z.enum(PARTICIPANT_STATES),
      ai: z.string(), // AI の名前（claude・codex など）
      model: z.string(),
      env: z.string(), // 環境名
      sessionName: z.string(), // 元のセッション名（空でもよい）
      link: z.string().min(1), // 使い捨ての合言葉（画面には出さない。同じ link の要求は 1 人にまとまる）
      wantedName: z.string().trim().min(1).max(WORKROOM_NAME_MAX).optional(), // 要求中が入りたいワークルームの名前
      as: z.enum(["visitor"]).optional(), // 要求中が頼んだ参加者区分（visitor はビジターとしての参加。省けば受け入れるときに選ぶ）
      workroom: z.string().min(1).optional(), // 入っているワークルームの id（joined だけ）
      requestedAt: z.string(),
      joinedAt: z.string().optional(), // 受け入れた時点（joined と visitor だけ）
    })
    .refine(p => {
      if (p.state === "requested") return p.workroom === undefined && p.joinedAt === undefined
      const accepted = p.joinedAt !== undefined && p.wantedName === undefined && p.as === undefined
      return accepted && (p.state === "joined" ? p.workroom !== undefined : p.workroom === undefined)
    }),
  refers: p => (p.workroom === undefined ? [] : [{ subject: WORKROOM.id, id: p.workroom }]),
  keys: {
    link: { type: "text", of: p => p.link },
    state: { type: "text", of: p => p.state },
    workroom: { type: "text", of: p => p.workroom },
  },
})

export const ADMIN_MARK = kit.defineSubject({
  id: "admin-mark",
  title: "adminMark",
  aiDescription:
    "The administrator's mark: which workroom is the administrator (the id, or none). There is one, with the id admin.",
  record: z.strictObject({ id: z.string().min(1), workroom: z.string().min(1) }), // id は "admin"（admin-set が作る）
  refers: a => (a.workroom === "none" ? [] : [{ subject: WORKROOM.id, id: a.workroom }]),
})

// 参加を利用者に伝える文の鍵（常駐がUserPromptSubmit のフックで使う）
export const JOINED_MESSAGE = kit.message("Joined matomezu. Workroom name: {name}")
export const VISITOR_JOINED_MESSAGE = kit.message("Joined matomezu as a visitor (read only)")

// データの型（画面の見た目は、ここから読む）
export type Participant = z.output<typeof PARTICIPANT.record>
export type Workroom = z.output<typeof WORKROOM.record>
// アクションが読んだ索引キーの行（種類 subject の、id と索引キーの値）
const keysIn = <S extends SubjectId>(ctx: Pick<ActionContext, "keys">, subject: S) =>
  Object.entries<KeyValuesOf<S>>(ctx.keys?.[subject] ?? {}).map(([id, keys]) => ({ id, keys }))

const BIRD_ARGS = { bird: z.enum(BIRD_IDS), palette: z.enum(BIRD_PALETTE_IDS).optional() }
const NAME = z.string().trim().min(1).max(WORKROOM_NAME_MAX)

export const PARTICIPANT_REQUEST = kit.defineAction({
  id: "participant-request",
  aiDescription:
    "Ask to join the user's workroom as a participant. ai (your AI name, such as claude or codex), model, env (the environment name) and link (a one-time passphrase uuid you made for this session) are required; sessionName (the name of the original session) is optional; wantedName (a workroom name to start with, up to 20 characters) is optional; as: visitor asks to join only to read (a visitor has no workroom, so it is refused together with wantedName). The participant waits as requested until the user accepts it on the screen. Refused when a participant has the link already, or when too many requests wait. Returns the participant's id.",
  title: "Request to participate",
  target: PARTICIPANT.id,
  // 同じ合言葉の参加者と、要求中の参加者の、索引キーだけ
  reads: args => [
    { subject: PARTICIPANT.id, where: [{ key: "link", eq: args.link }], keysOnly: true },
    { subject: PARTICIPANT.id, where: [{ key: "state", eq: "requested" }], keysOnly: true },
  ],
  runsWhenAIJoins: "make-participant",
  args: z.strictObject({
    ai: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(80),
    env: z.string().trim().min(1).max(80),
    sessionName: z.string().trim().max(120).optional(),
    link: z.string().trim().min(1).max(80),
    wantedName: NAME.optional(),
    as: z.enum(["visitor"]).optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    if (args.as === "visitor" && args.wantedName !== undefined)
      return { declined: "a visitor has no workroom: leave wantedName out" }
    const all = keysIn(ctx, PARTICIPANT.id)
    if (all.some(p => p.keys.link === args.link)) return { declined: "a participant has the link already" }
    if (all.filter(p => p.keys.state === "requested").length >= PARTICIPANTS_LIMIT)
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
      ...(args.as ? { as: args.as } : {}),
      requestedAt: ctx.now,
    }
    return { next: requested, result: { participant: requested.id } }
  },
})

// ワークルーム room に入っている参加者の索引キーを読む宣言
export const readsParticipantsIn = (room: string) => ({
  subject: PARTICIPANT.id,
  where: [{ key: "workroom" as const, eq: room }],
  keysOnly: true as const,
})

const NEW_WORKROOM = z.strictObject({ name: NAME, ...BIRD_ARGS })
// 外す参加者の id（いる参加者を外して入れる・消すとき。渡した参加者がそのワークルームにいるときだけ外す）
const OCCUPANT = z.string().min(1).optional()

// ワークルーム room に入っている参加者のうち、外す参加者 occupant だけなら、外す id の並びを返す（誰もいなければ空。別の参加者がいれば null）
const leaving = (ctx: Pick<ActionContext, "keys">, room: string, occupant: string | undefined): string[] | null => {
  const inRoom = keysIn(ctx, PARTICIPANT.id)
    .filter(p => p.keys.workroom === room)
    .map(p => p.id)
  if (inRoom.length === 0) return []
  return occupant !== undefined && inRoom.length === 1 && inRoom[0] === occupant ? [occupant] : null
}

// 全部のワークルームの索引キー（名前が重ならないか、管理者の印の指す先が在るかを見る）
export const READS_WORKROOM_KEYS = { subject: WORKROOM.id, where: [], keysOnly: true as const }

// ワーカーを受け入れるとき、入れたワークルームを管理者にするか: 印が無いか、指す先のワークルームが無い（このトランザクションで消すワークルーム gone も無いと見る）とき。
// 利用者が選んだ none は残す。ctx は READS_ADMIN と READS_WORKROOM_KEYS を読んだアクションの文脈
function lacksAdmin(ctx: Pick<ActionContext, "records" | "keys">, gone: string | undefined): boolean {
  const marks = Object.values(ctx.records?.[ADMIN_MARK.id] ?? {}).flatMap(mark => {
    const read = ADMIN_MARK.record.safeParse(mark)
    return read.success ? [read.data.workroom] : []
  })
  if (marks.length === 0) return true
  return marks.every(w => w !== "none" && (w === gone || ctx.keys?.[WORKROOM.id]?.[w] === undefined))
}

export const PARTICIPANT_ACCEPT = kit.defineAction({
  id: "participant-accept",
  aiDescription:
    "Accept the requested participant named by on.record (only the user), in one transaction. args.as: visitor accepts it as a visitor that only reads, with no workroom. Otherwise it goes into a workroom: either args.workroom (a workroom that is there; args.occupant, the id of the participant in it, is removed first) or args.newWorkroom (name up to 20 characters not repeated, bird, palette: a new workroom is made; args.discarding {workroom, occupant?} removes that workroom and its participant first, so the new name may be the same). A participant that asked to join as a visitor is accepted only as a visitor. When there is no administrator (no mark, or the mark points at no workroom), the workroom it goes into gets the administrator's mark; a mark set to none stays. Refused unless the participant is requested, the workroom is there and no participant other than the given occupant is in it; nothing changes then. Returns the workroom's id (none for a visitor).",
  title: "Accept a participant",
  target: PARTICIPANT.id,
  writes: [WORKROOM.id, ADMIN_MARK.id],
  // ワーカーなら: 全部のワークルームの索引キー（名前の重なりと、管理者の印の指す先）・管理者の印・入るワークルームか捨てるワークルームと、そこに入っている参加者の索引キー
  reads: args => {
    if ("as" in args) return []
    const into =
      "newWorkroom" in args
        ? args.discarding === undefined
          ? []
          : [{ subject: WORKROOM.id, id: args.discarding.workroom }, readsParticipantsIn(args.discarding.workroom)]
        : [{ subject: WORKROOM.id, id: args.workroom }, readsParticipantsIn(args.workroom)]
    return [READS_WORKROOM_KEYS, READS_ADMIN, ...into]
  },
  userOnly: true,
  args: z.union([
    z.strictObject({ as: z.enum(["visitor"]) }),
    z.strictObject({ workroom: z.string().min(1), occupant: OCCUPANT }),
    z.strictObject({
      newWorkroom: NEW_WORKROOM,
      discarding: z.strictObject({ workroom: z.string().min(1), occupant: OCCUPANT }).optional(),
    }),
  ]),
  run: (now, args, ctx) => {
    if (now === "none" || now.state !== "requested") return null
    const { wantedName: _, as: asked, ...rest } = now
    if ("as" in args) return { next: { ...rest, state: "visitor", joinedAt: ctx.now }, result: { workroom: "none" } }
    if (asked === "visitor") return { declined: "the participant asked to join as a visitor: accept it as a visitor" }
    const joined = (workroom: string): Participant => ({ ...rest, state: "joined", workroom, joinedAt: ctx.now })
    // 管理者がいなければ、入れたワークルームに管理者の印を付ける
    const admin = (workroom: string, gone: string | undefined) =>
      lacksAdmin(ctx, gone) ? [{ subject: ADMIN_MARK.id, id: "admin", record: { id: "admin", workroom } }] : []
    if (!("newWorkroom" in args)) {
      if (ctx.records?.[WORKROOM.id]?.[args.workroom] === undefined) return { declined: "the workroom is not there" }
      const out = leaving(ctx, args.workroom, args.occupant)
      if (out === null) return { declined: "a participant is in the workroom already" }
      return {
        next: joined(args.workroom),
        others: [...out.map(id => ({ id, record: "removed" as const })), ...admin(args.workroom, undefined)],
        result: { workroom: args.workroom },
      }
    }
    const discarding = args.discarding
    if (discarding !== undefined && ctx.records?.[WORKROOM.id]?.[discarding.workroom] === undefined)
      return { declined: "the workroom to discard is not there" }
    const gone = discarding === undefined ? [] : leaving(ctx, discarding.workroom, discarding.occupant)
    if (gone === null) return { declined: "a participant is in the workroom to discard" }
    // 同じ名前は、捨てるワークルームだけが持っていてよい
    if (keysIn(ctx, WORKROOM.id).some(w => w.keys.name === args.newWorkroom.name && w.id !== discarding?.workroom))
      return { declined: `a workroom named ${args.newWorkroom.name} already exists` }
    const room: Workroom = {
      id: ctx.newId(),
      name: args.newWorkroom.name,
      bird: args.newWorkroom.bird,
      ...(args.newWorkroom.palette ? { palette: args.newWorkroom.palette } : {}),
      createdAt: ctx.now,
    }
    return {
      next: joined(room.id),
      others: [
        { subject: WORKROOM.id, id: room.id, record: room },
        ...(discarding === undefined
          ? []
          : [{ subject: WORKROOM.id, id: discarding.workroom, record: "removed" as const }]),
        ...gone.map(id => ({ id, record: "removed" as const })),
        ...admin(room.id, discarding?.workroom),
      ],
      result: { workroom: room.id },
    }
  },
})

export const PARTICIPANT_DECLINE = kit.defineAction({
  id: "participant-decline",
  aiDescription:
    "Decline the requested participant named by on.record and remove it (only the user). Refused unless it is requested.",
  title: "Decline a participant",
  target: PARTICIPANT.id,
  userOnly: true,
  args: z.strictObject({}),
  run: now => (now === "none" || now.state !== "requested" ? null : { next: "removed", result: {} }),
})

export const PARTICIPANT_REMOVE = kit.defineAction({
  id: "participant-remove",
  aiDescription:
    "Remove the accepted participant named by on.record (only the user): a joined one leaves its workroom (the workroom stays, empty), a visitor leaves.",
  title: "Remove a participant",
  target: PARTICIPANT.id,
  userOnly: true,
  runsWhenAIEnds: true,
  args: z.strictObject({}),
  run: now => (now === "none" || now.state === "requested" ? null : { next: "removed", result: {} }),
})

export const WORKROOM_ADD = kit.defineAction({
  id: "workroom-add",
  aiDescription:
    "Add an empty workroom with a name (up to 20 characters, not repeated), a bird and a palette (only the user). Returns the workroom's id.",
  title: "Add a workroom",
  target: WORKROOM.id,
  reads: args => [{ subject: WORKROOM.id, where: [{ key: "name", eq: args.name }], keysOnly: true }],
  userOnly: true,
  args: z.strictObject({ name: NAME, ...BIRD_ARGS }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    if (keysIn(ctx, WORKROOM.id).length > 0) return { declined: `a workroom named ${args.name} already exists` }
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
  reads: args =>
    args.name === undefined ? [] : [{ subject: WORKROOM.id, where: [{ key: "name", eq: args.name }], keysOnly: true }],
  userOnly: true,
  args: z.strictObject({ name: NAME.optional(), bird: BIRD_ARGS.bird.optional(), palette: BIRD_ARGS.palette }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    if (args.name !== undefined && keysIn(ctx, WORKROOM.id).some(w => w.id !== now.id))
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
    "Remove the workroom named by on.record (only the user), in one transaction. args.occupant is the id of the participant in it, removed together. Refused when another participant is in it; nothing changes then.",
  title: "Remove a workroom",
  target: WORKROOM.id,
  writes: [PARTICIPANT.id],
  // このワークルームに入っている参加者の索引キー
  reads: (_args, _actor, on) => (on === undefined ? [] : [readsParticipantsIn(on)]),
  userOnly: true,
  args: z.strictObject({ occupant: OCCUPANT }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    const out = leaving(ctx, now.id, args.occupant)
    if (out === null) return { declined: "a participant is in the workroom" }
    return {
      next: "removed",
      others: out.map(id => ({ subject: PARTICIPANT.id, id, record: "removed" as const })),
      result: {},
    }
  },
})

export const ADMIN_SET = kit.defineAction({
  id: "admin-set",
  aiDescription:
    "Set the administrator's mark to a workroom (its id) or to none (only the user). Without on it makes the mark.",
  title: "Set the administrator",
  target: ADMIN_MARK.id,
  reads: args => (args.workroom === "none" ? [] : [{ subject: WORKROOM.id, id: args.workroom }]),
  userOnly: true,
  args: z.strictObject({ workroom: z.string().min(1) }),
  run: (_now, args, ctx) => {
    if (args.workroom !== "none" && ctx.records?.[WORKROOM.id]?.[args.workroom] === undefined)
      return { declined: "the workroom is not there" }
    return { next: { id: "admin", workroom: args.workroom }, result: {} }
  },
})
// 管理者の印を読むアクションが reads に足す物（印は全体に 1 件）
export const READS_ADMIN: RecordRead = { subject: ADMIN_MARK.id, where: [] }

// 管理者のワークルームの id（印が無い・none・指す先のワークルームが無ければ undefined。決め方は adminRoomOf）。
// ctx は READS_ADMIN と READS_WORKROOM_KEYS を読んだアクションの文脈
export function adminWorkroom(ctx: Pick<ActionContext, "records" | "keys">): string | undefined {
  const mark = Object.values(ctx.records?.[ADMIN_MARK.id] ?? {}).flatMap(m => {
    const read = ADMIN_MARK.record.safeParse(m)
    return read.success ? [read.data] : []
  })[0]
  return adminRoomOf(
    mark,
    Object.keys(ctx.keys?.[WORKROOM.id] ?? {}).map(id => ({ id })),
  )
}

// actor が、管理者のワークルーム（adminWorkroom）に入っている AI か。ctx は READS_ADMIN と READS_WORKROOM_KEYS を読んだアクションの文脈
export function isAdminActor(actor: Actor, ctx: Pick<ActionContext, "records" | "keys">): boolean {
  const id = workroomOfActor(actor)
  return id !== undefined && adminWorkroom(ctx) === id
}

export { PARTICIPANT_ALIVE } from "./alive"
export { PARTICIPANT_JOIN_DIALOG, PARTICIPANT_WELCOME_DIALOG } from "./dialogs"
export type { ParticipantCategory, VisitorRow, WorkroomRow, WorkroomState } from "./rows"
export { participantCategory, visitorName } from "./rows"
