// 参加要求の郵便: 参加者（core/participant.ts）の参加要求が届いたことを利用者に知らせる。種類は join-request、送るのは mail-join-request（利用者だけが行うアクション。AI の参加の頼みを受けたホストが、利用者として送る）。
// 参加者と郵便は別の種類のレコードなので、郵便には参加者の id と、本文に出す ai・model・env・sessionName と、あれば Orca の作業場所と、ビジターとして頼んだか（as）を添える
import { z } from "zod"
import { kit } from "../kit"
import { WORKROOM_NAME_MAX } from "../participant"
import { MAIL, mailAdded, READS_MAILBOX_KEYS } from "./subject"

const orcaWorkspace = z
  .string()
  .trim()
  .min(1)
  .refine(name => [...name].length <= 120)
  .optional()

const JoinRequestSchema = z.strictObject({
  participant: z.string().min(1), // 参加者の id
  ai: z.string(),
  model: z.string(),
  env: z.string(),
  orcaWorkspace,
  sessionName: z.string(), // 空でもよい
  workroom: z.string().min(1).max(WORKROOM_NAME_MAX).optional(), // AI が頼んだワークルームの名前（前のを続けるか、その名前で始めたい。無くてもよい）
  as: z.enum(["visitor"]).optional(), // AI が頼んだ参加者区分（visitor はビジター。読むだけで、ワークルームは持たない）
})
export type JoinRequestProps = z.output<typeof JoinRequestSchema>

export const MAIL_JOIN_REQUEST = kit.defineMail({
  id: "join-request",
  title: "Mail join request",
  aiDescription:
    "A notice that an AI agent asked to join the workroom (a participant request; with workroom, the name of the workroom it would like to continue or start). The user accepts or declines it on the screen, choosing there whether it takes over a participant who joined before or starts new. props: the participant's id, ai, model, env, sessionName and optionally workroom, orcaWorkspace and as (visitor when it asked to join only to read).",
  props: JoinRequestSchema,
  aiBrief: (p: JoinRequestProps) => ["join request:", p.ai, p.model, p.sessionName].filter(Boolean).join(" "),
  shown: {
    title: (_p: JoinRequestProps, t) => t(kit.message("A join request arrived from an AI agent")),
    body: (p: JoinRequestProps, t) =>
      [
        ...(p.as === "visitor"
          ? [`${t(kit.message("Participant category"))}: ${t(kit.message("Visitor (read only)"))}`]
          : []),
        ...(p.workroom ? [`${t(kit.message("Workroom name"))}: ${p.workroom}`] : []),
        `${t(kit.message("AI"))}: ${p.ai}`,
        `${t(kit.message("Model"))}: ${p.model}`,
        `${t(kit.message("Environment"))}: ${p.env}`,
        ...(p.orcaWorkspace ? [`${t(kit.message("Orca workspace"))}: ${p.orcaWorkspace}`] : []),
        ...(p.sessionName ? [`${t(kit.message("Session"))}: ${p.sessionName}`] : []),
      ].join("\n"),
  },
})

export const MAIL_JOIN_REQUEST_SEND = kit.defineAction({
  id: "mail-join-request",
  aiDescription:
    "Tell the user's mailbox that a participant asked to join (the host does this when an AI asks to join; it shows at once on the user's screen). participant is the id participant-request returned; ai, model, env and sessionName (optional) are the participant's; workroom (optional, up to 20 characters) is the name of the workroom it would like to continue or start; as (optional) is visitor when it asked to join only to read. orcaWorkspace is the display name of the Orca workspace when known. from is a short name telling who sends it. Returns the mail's id.",
  title: "Send a join request",
  target: MAIL.id,
  reads: READS_MAILBOX_KEYS,
  userOnly: true,
  runsWhenAIJoins: "notify-user",
  args: z.strictObject({
    from: z.string().trim().min(1).max(40),
    participant: z.string().min(1),
    ai: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(80),
    env: z.string().trim().min(1).max(80),
    orcaWorkspace,
    sessionName: z.string().trim().max(120).optional(),
    workroom: z.string().trim().min(1).max(WORKROOM_NAME_MAX).optional(),
    as: z.enum(["visitor"]).optional(),
  }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const added = mailAdded(ctx, {
      mail: MAIL_JOIN_REQUEST.id,
      from: args.from,
      sentAt: ctx.now,
      props: {
        participant: args.participant,
        ai: args.ai,
        model: args.model,
        env: args.env,
        ...(args.orcaWorkspace ? { orcaWorkspace: args.orcaWorkspace } : {}),
        sessionName: args.sessionName ?? "",
        ...(args.workroom ? { workroom: args.workroom } : {}),
        ...(args.as ? { as: args.as } : {}),
      } satisfies JoinRequestProps,
    })
    return (
      added && {
        next: added.next,
        others: added.others,
        result: { mail: added.next.id },
        aiEditTickets: added.aiEditTickets,
      }
    )
  },
})
