// リフレッシュリクエスト（run が返す refreshRequest）: 書庫かレコードが対象のアクションが返せる。返せるのはワークルームに入っている AI のときだけで、1 つのアクションバルクに 1 つまで
import { expect, test } from "bun:test"
import { z } from "zod"
import { AI, USER } from "../../web/src/core/actor"
import { type BulkAction, performBulk } from "../../web/src/core/bulk"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { defineAction } from "../../web/src/core/def/action"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { worldOf } from "../../web/src/store/world"
import { BUILTIN_PARTS, CORE_CATALOG, newStore } from "../support"

// 書庫を変えずに、リフレッシュリクエストだけを返すアクション
const ASK = defineAction({
  id: "t:refresh",
  title: "@matomezu/base:Move to trash",
  aiDescription: "Ask to have the conversation refreshed.",
  target: "library",
  permissionScope: "unknown",
  args: z.strictObject({}),
  run: library => ({ next: library, result: {}, refreshRequest: { text: "read it" } }),
})
const center = CORE_CATALOG.controlCenters.get(BUILTIN_CONTROL_CENTER)!
const catalog = buildCoreCatalog({
  ...BUILTIN_PARTS,
  actions: [...BUILTIN_PARTS.actions, ASK],
  controlCenters: [{ ...center, actions: [...center.actions, ASK.id] as never }],
})
const step: BulkAction = {
  action: ASK.id,
  args: {},
  newId: () => "n",
  now: "2026-11-28T00:00:00.000Z",
  today: "2026-11-28",
}
const bulk = (actor: typeof AI, steps: BulkAction[]) =>
  performBulk(worldOf(newStore().state.getState()), steps, {
    catalog,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja" as const,
    actor,
  })

test("ワークルームに入っている AI なら、リフレッシュリクエストをバルクの結果に載せる", () => {
  expect(bulk(AI, [step])).toMatchObject({ ok: true, refreshRequest: { text: "read it" } })
})

test("利用者が行えば断る（ワークルームに入っていない AI は、アクションそのものを行えない）", () => {
  expect(bulk(USER, [step])).toMatchObject({ ok: false, detail: expect.stringContaining("only an AI in a workroom") })
})

test("1 つのバルクに 2 つ返せば、2 つ目で断る", () => {
  expect(bulk(AI, [step, step])).toMatchObject({ ok: false, detail: "one refresh request in a bulk", at: 1 })
})
