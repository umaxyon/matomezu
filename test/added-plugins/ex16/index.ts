// ex16: matomezu ペイロードを送り、レシーバーで受ける追加プラグイン（常駐のテストが使う）。かぞえ（レコード）が、送る物を引数のまま返し、
// 受けた数を足して、受けた 1 通（送り手・封筒の id・返事の元）を記録に残す。受けた引数の next を、そのまま次に送る
import { definePlugin, type Payload, UNDELIVERED_ARGS, z } from "matomezu"
import { kit } from "./kit"

export const TALLY = kit.defineSubject({
  id: "tally",
  title: "tally",
  aiDescription: "A tally: a count, and the log of what it received.",
  record: z.strictObject({ id: z.string().min(1), count: z.number().int(), log: z.array(z.string()) }),
})

const fresh = (id: string) => ({ id, count: 0, log: [] as string[] })

// 引数の payloads をそのまま送る（on を省けば、かぞえを作って送る）
export const TALLY_SEND = kit.defineAction({
  id: "tally-send",
  title: "send from tally",
  aiDescription:
    "Send the payloads in args from the tally named by on.record (or a new tally without on). Returns the tally's id.",
  target: TALLY.id,
  args: z.strictObject({ payloads: z.array(z.unknown()) }),
  run: (now, args, ctx) => {
    const next = now === "none" ? fresh(ctx.newId()) : now
    return { next, result: { tally: next.id }, payloads: args.payloads as Payload[] }
  },
})

// 受けた数 n を足し、受けた 1 通を記録して、next を送る（n が負なら断る）
export const TALLY_RECEIVE = kit.defineAction({
  id: "tally-receive",
  title: "receive into tally",
  aiDescription:
    "Receives a number n into the tally and sends next on (a negative n is refused). Returns the tally's id and count.",
  target: TALLY.id,
  receives: "messages",
  args: z.strictObject({ n: z.number().int(), next: z.array(z.unknown()).optional() }),
  run: (now, args, ctx) => {
    if (args.n < 0) return { declined: "a negative n" }
    const was = now === "none" ? fresh(ctx.newId()) : now
    const r = ctx.received
    const line = `${r?.from.kind}:${r?.from.kind === "ai" ? r.from.workroom : ""}:${r?.envelope}:${r?.inReplyTo ?? ""}`
    const next = { ...was, count: was.count + args.n, log: [...was.log, line] }
    return { next, result: { tally: next.id, count: next.count }, payloads: (args.next ?? []) as Payload[] }
  },
})

// 届かなかった結果を記録する
export const TALLY_UNDELIVERED = kit.defineAction({
  id: "tally-undelivered",
  title: "tally undelivered",
  aiDescription: "Takes an undelivered result into the tally's log.",
  target: TALLY.id,
  receives: "undelivered",
  args: UNDELIVERED_ARGS,
  run: (now, args) =>
    now === "none"
      ? null
      : { next: { ...now, log: [...now.log, `undelivered:${args.envelope}:${args.reason}`] }, result: {} },
})

export const EX16 = definePlugin(
  kit.plugin({ subjects: [TALLY], actions: [TALLY_SEND, TALLY_RECEIVE, TALLY_UNDELIVERED] }),
)

export default EX16

declare module "matomezu/catalog" {
  interface SubjectTable {
    "ex16:tally": typeof TALLY
  }
  interface ActionTable {
    "ex16:tally-send": typeof TALLY_SEND
    "ex16:tally-receive": typeof TALLY_RECEIVE
    "ex16:tally-undelivered": typeof TALLY_UNDELIVERED
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
