// 参加要求の郵便: 参加者（core/participant.ts）の参加要求が届いたことを利用者に知らせる。種類は join-request、送るのは mail-join-request（利用者だけが行うアクション。AI の参加の頼みを受けたホストが、利用者として送る）。
// 参加者の表と郵便箱は別の対象なので、郵便には参加者の id と、本文に出す ai・model・env・sessionName を添える
import { z } from "zod"
import { freshId } from "../../../core/ids"
import type { Mail } from "../../../core/mail"
import { WORKROOM_NAME_MAX } from "../../../core/participant"
import { kit } from "../kit"
import { withinLimit } from "."

const JoinRequestSchema = z.strictObject({
  participant: z.string().min(1), // 参加者の id
  ai: z.string(),
  model: z.string(),
  env: z.string(),
  sessionName: z.string(), // 空でもよい
  workroom: z.string().min(1).max(WORKROOM_NAME_MAX).optional(), // AI が頼んだワークルームの名前（前のを続けるか、その名前で始めたい。無くてもよい）
})
export type JoinRequestProps = z.output<typeof JoinRequestSchema>

export const MAIL_JOIN_REQUEST = kit.defineMail({
  id: "join-request",
  title: "Mail join request",
  aiDescription:
    "A notice that an AI agent asked to join the workroom (a participant request; with workroom, the name of the workroom it would like to continue or start). The user accepts or declines it on the screen, choosing there whether it takes over a participant who joined before or starts new. props: the participant's id, ai, model, env, sessionName, projects and workroom (optional).",
  props: JoinRequestSchema,
  aiBrief: (p: JoinRequestProps) => ["join request:", p.ai, p.model, p.sessionName].filter(Boolean).join(" "),
  shown: {
    title: (_p: JoinRequestProps, t) => t(kit.message("A join request arrived from an AI agent")),
    body: (p: JoinRequestProps, t) =>
      [
        ...(p.workroom ? [`${t(kit.message("Workroom name"))}: ${p.workroom}`] : []),
        `${t(kit.message("AI"))}: ${p.ai}`,
        `${t(kit.message("Model"))}: ${p.model}`,
        `${t(kit.message("Environment"))}: ${p.env}`,
        ...(p.sessionName ? [`${t(kit.message("Session"))}: ${p.sessionName}`] : []),
      ].join("\n"),
  },
})

export const MAIL_JOIN_REQUEST_SEND = kit.defineAction({
  id: "mail-join-request",
  aiDescription:
    "Tell the user's mailbox that a participant asked to join (the host does this when an AI asks to join; it shows at once on the user's screen). participant is the id participant-request returned; ai, model, env and sessionName (optional) are the participant's; workroom (optional, up to 20 characters) is the name of the workroom it would like to continue or start. from is a short name telling who sends it. If a notice for the participant is already in the mailbox, nothing changes and its id is returned. Returns the mail's id.",
  title: "Send a join request",
  target: "mailbox",
  userOnly: true,
  runsWhenAIJoins: "notify-user",
  args: z.strictObject({
    from: z.string().trim().min(1).max(40),
    participant: z.string().min(1),
    ai: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(80),
    env: z.string().trim().min(1).max(80),
    sessionName: z.string().trim().max(120).optional(),
    workroom: z.string().trim().min(1).max(WORKROOM_NAME_MAX).optional(),
  }),
  run: (mailbox, args, ctx) => {
    const same = mailbox.find(
      m => m.mail === MAIL_JOIN_REQUEST.id && (m.props as JoinRequestProps).participant === args.participant,
    )
    if (same) return { next: mailbox, result: { mail: same.id } }
    const id = freshId(
      ctx.newId,
      mailbox.map(m => m.id),
    )
    const notice: Mail = {
      id,
      mail: MAIL_JOIN_REQUEST.id,
      from: args.from,
      sentAt: ctx.now,
      props: {
        participant: args.participant,
        ai: args.ai,
        model: args.model,
        env: args.env,
        sessionName: args.sessionName ?? "",
        ...(args.workroom ? { workroom: args.workroom } : {}),
      } satisfies JoinRequestProps,
    }
    return { next: withinLimit([...mailbox, notice]), result: { mail: id } }
  },
})
