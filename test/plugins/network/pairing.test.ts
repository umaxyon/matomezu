// ペアリングのアクション: 頼みを載せる・受け入れる（頼みを消し、ペアリングしたホストを同じ書き込みで載せる）・断る・ペアリングしたホストを載せる・解く。
// どれも利用者だけが行え、同じホスト id の物は 2 つ載らない。常駐が行う役は、役ごとに 1 つのアクションが名乗る
import { expect, test } from "bun:test"
import { type Actor, USER } from "../../../web/src/core/actor"
import { hostActions } from "../../../web/src/core/hosts"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { withCounters, withRecords } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { PAIRED_HOST, PAIRING_REQUEST } from "../../../web/src/plugins/network"
import { CORE_CATALOG } from "../../support"

const N = (id: string) => `@matomezu/network:${id}`
type Done = { ok: boolean; reason?: string; detail?: string; result?: Record<string, string> }
const AI: Actor = { kind: "ai", workroom: { id: "r1" } }
const B = "b".repeat(64)

function host() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const act = (actor: Actor, action: string, args: unknown, on?: { record: string }) => {
    const done = performIn(w, N(action), args, on, {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "ja",
      newId: () => `n${++n}`,
      now: "2026-11-23T00:00:00.000Z",
      today: "2026-11-23",
      actor,
    }) as PerformedIn
    if (done.ok)
      w = {
        ...w,
        ...(done.records ? { records: withRecords(w.records, done.records) } : {}),
        counters: withCounters(w.counters, done.counters),
      }
    return done as unknown as Done
  }
  const all = (kind: typeof PAIRED_HOST.id | typeof PAIRING_REQUEST.id) =>
    Object.values(w.records[kind] ?? {}) as Record<string, string>[]
  return { act, all }
}

const request = { hostId: B, name: "win-lan", userName: "taro", addr: "192.168.11.20:7240", code: "482913" }

test("受け入れると、頼みが消えて、頼みの名前のままペアリングしたホストが載る", () => {
  const h = host()
  const put = h.act(USER, "pairing-request-add", request)
  expect(put.ok).toBe(true)
  expect(h.act(USER, "pairing-request-add", request).detail).toContain("waiting")
  const done = h.act(USER, "pairing-accept", {}, { record: put.result?.request as string })
  expect(done.ok).toBe(true)
  expect(h.all(PAIRING_REQUEST.id)).toEqual([])
  expect(h.all(PAIRED_HOST.id)).toEqual([
    {
      id: done.result?.pairedHost as string,
      hostId: B,
      nameAtPairing: "win-lan",
      userNameAtPairing: "taro",
      addr: "",
      pairedAt: "2026-11-23T00:00:00.000Z",
    },
  ])
})

test("ペアリング済みのホストからの頼みは受け入れられず、断ると頼みだけが消える", () => {
  const h = host()
  expect(h.act(USER, "paired-host-add", { hostId: B, nameAtPairing: "w", userNameAtPairing: "", addr: "" }).ok).toBe(
    true,
  )
  expect(h.act(USER, "paired-host-add", { hostId: B, nameAtPairing: "w", userNameAtPairing: "", addr: "" }).ok).toBe(
    false,
  )
  const put = h.act(USER, "pairing-request-add", request)
  const on = { record: put.result?.request as string }
  expect(h.act(USER, "pairing-accept", {}, on).detail).toContain("paired already")
  expect(h.act(USER, "pairing-decline", {}, on).ok).toBe(true)
  expect(h.all(PAIRING_REQUEST.id)).toEqual([])
  expect(h.all(PAIRED_HOST.id)).toHaveLength(1)
})

test("ペアリングを解くと消える。AI はどのアクションも行えない", () => {
  const h = host()
  const put = h.act(USER, "paired-host-add", { hostId: B, nameAtPairing: "w", userNameAtPairing: "", addr: "" })
  for (const [action, args] of [
    ["pairing-request-add", request],
    ["paired-host-add", { hostId: "c".repeat(64), nameAtPairing: "w", userNameAtPairing: "", addr: "" }],
  ] as const)
    expect(h.act(AI, action, args).ok).toBe(false)
  expect(h.act(AI, "paired-host-remove", {}, { record: put.result?.pairedHost as string }).ok).toBe(false)
  expect(h.act(USER, "paired-host-remove", {}, { record: put.result?.pairedHost as string }).ok).toBe(true)
  expect(h.all(PAIRED_HOST.id)).toEqual([])
})

test("常駐が行う役は、4 つとも network のアクションが名乗る", () => {
  expect(hostActions(CORE_CATALOG)).toEqual({
    "add-pairing-request": N("pairing-request-add"),
    "remove-pairing-request": N("pairing-decline"),
    "add-paired-host": N("paired-host-add"),
    "remove-paired-host": N("paired-host-remove"),
  })
})
