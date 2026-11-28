// リフレッシュを頼むアクション（refresh-ask）: 利用者だけが行え、ワークルームの名前と参加者を送り先にした matomezu ペイロードで、refresh-request を使うよう頼む

import { expect, test } from "bun:test"
import { type Actor, USER } from "../../../web/src/core/actor"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { withCounters, withRecords } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { REFRESH_ASK } from "../../../web/src/plugins/base/participant/refresh-ask"
import { REFRESH_REQUEST_ID } from "../../../web/src/plugins/base/participant/refresh-request-id"
import { CORE_CATALOG } from "../../support"

type Done = PerformedIn & { result?: { workroom?: string }; payloads?: unknown }

function world() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const act = (actor: Actor, action: string, args: unknown, on?: { record: string }) => {
    const done = performIn(w, action.includes(":") ? action : `@matomezu/base:${action}`, args, on, {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "ja",
      newId: () => `n${++n}`,
      now: "2026-11-28T00:00:00.000Z",
      today: "2026-11-28",
      actor,
    }) as Done
    if (done.ok)
      w = {
        ...w,
        ...(done.records ? { records: withRecords(w.records, done.records) } : {}),
        counters: withCounters(w.counters, done.counters),
      }
    return done
  }
  return { act }
}

test("利用者が行うと、ワークルームの名前と参加者を送り先にして、refresh-request を使うよう頼む 1 通を返す", () => {
  const { act } = world()
  const room = act(USER, "workroom-add", { name: "桜", bird: "inko" }).result?.workroom as string
  const done = act(USER, REFRESH_ASK.id, { participant: "p1" }, { record: room })
  expect(done.ok).toBe(true)
  expect(done.payloads).toEqual([
    { to: { workroom: "桜", participant: "p1" }, text: expect.stringContaining(REFRESH_REQUEST_ID) },
  ])
})

test("AI は行えない（利用者だけ）。ワークルームが無ければ行えない", () => {
  const { act } = world()
  const room = act(USER, "workroom-add", { name: "桜", bird: "inko" }).result?.workroom as string
  expect(act({ kind: "ai", workroom: { id: room } }, REFRESH_ASK.id, { participant: "p1" }, { record: room }).ok).toBe(
    false,
  )
  expect(act(USER, REFRESH_ASK.id, { participant: "p1" }, { record: "none-such" }).ok).toBe(false)
})
