// matomezu ペイロード（run が返す payloads）: レコードが対象のアクションが返せる。返せるのは利用者か、ワークルームに入っている AI のとき
import { expect, test } from "bun:test"
import { z } from "zod"
import { type Actor, AI, AI_NOT_JOINED, AI_VISITOR, USER } from "../../web/src/core/actor"
import type { SubjectDef } from "../../web/src/core/def/subject"
import { performIn, type World } from "../../web/src/core/perform-world"
import { BUILTIN } from "../../web/src/plugins"
import { assemble, defineBuiltin, type Plugin } from "../../web/src/store/plugin"

const CARD = "@ex/pay:card"
const CENTER = "@ex/pay:center"
const title = "@matomezu/base:Language" as never
const SUBJECT: SubjectDef = {
  id: CARD,
  title,
  aiDescription: "a card",
  record: z.strictObject({ id: z.string().min(1) }),
} as never
const payload = { to: { workroom: "すずめ" }, text: "hello" }
const SEND = {
  id: "@ex/pay:card-add",
  title,
  aiDescription: "Add a card and send a payload.",
  target: CARD,
  args: z.strictObject({}),
  run: (_now: unknown, _args: unknown, ctx: { newId(): string }) => ({
    next: { id: ctx.newId() },
    result: {},
    payloads: [payload],
  }),
}
const EX = {
  id: "@ex/pay",
  subjects: [SUBJECT],
  actions: [SEND],
  controlCenters: [{ id: CENTER, actions: [], subjects: [CARD] }],
} as unknown as Plugin
const catalog = assemble([...BUILTIN, defineBuiltin(EX as never)], CENTER).catalog.core
const empty: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
const run = (actor: Actor) =>
  performIn(empty, SEND.id as never, {}, undefined, {
    catalog,
    controlCenter: CENTER,
    lang: "en",
    newId: () => "c1",
    now: "2026-11-28T00:00:00.000Z",
    today: "2026-11-28",
    actor,
  })

test("利用者とワークルームに入っている AI なら、送る matomezu ペイロードを結果に載せる（送り手は常駐が行った者から決める）", () => {
  expect(run(USER)).toMatchObject({ ok: true, payloads: [payload] })
  expect(run(AI)).toMatchObject({ ok: true, payloads: [payload] })
})

test("ワークルームに入っていない AI は送れない（書けない AI は、アクションそのものを断られる）", () => {
  for (const actor of [AI_NOT_JOINED, AI_VISITOR]) expect(run(actor)).toMatchObject({ ok: false })
})
