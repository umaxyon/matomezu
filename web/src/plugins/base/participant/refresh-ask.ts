// リフレッシュを頼むアクション（refresh-ask）: 利用者が、ワークルームに入っている参加者の AI に、切りのよい所で引継ぎページを書いて会話を空にするよう頼む。
// 頼みは matomezu ペイロードで送り、AI がリフレッシュリクエストのアクションを使う。従うか・いつかは AI 次第で、頼みの行く末は追わない。
// 送り先は参加者まで名指すので、画面を開いた後にワークルームの AI が入れ替わっていれば、届かずに断られる
import { z } from "zod"
import { kit } from "../kit"
import { REFRESH_REQUEST_ID } from "./refresh-request-id"
import { WORKROOM } from "./workroom"

// 頼まれた AI に送る文（AI に見せる英語）
const REFRESH_ASK_TEXT =
  `At a good point in your work, use the action ${REFRESH_REQUEST_ID} to write the handoff page ` +
  "(into the worker book of your handoff target, or of your current work when there is none) and have your conversation cleared."

export const REFRESH_ASK = kit.defineAction({
  id: "refresh-ask",
  aiDescription:
    "Ask the AI of participant args.participant in the workroom named by on.record to write the handoff page and have its conversation cleared at a good point (only the user). Refused when that participant is not in that workroom.",
  title: "Send the instruction to clear the context",
  target: WORKROOM.id,
  userOnly: true,
  args: z.strictObject({ participant: z.string().min(1) }),
  run: (now, args) =>
    now === "none"
      ? null
      : {
          next: now,
          result: {},
          payloads: [{ to: { workroom: now.name, participant: args.participant }, text: REFRESH_ASK_TEXT }],
        },
})
