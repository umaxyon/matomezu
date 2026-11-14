import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Body } from "../../scripts/relay-log"
import { openStore } from "../../scripts/relay-log/store"

const dir = mkdtempSync(join(tmpdir(), "relay-store-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const entry = (session: string, at: string) => ({
  at,
  session,
  sessionId: "sid",
  status: 200,
  ms: 1,
  stream: "s",
  diverge: "none",
  summary: {} as never,
  newResults: [],
  usage: {},
})
const body = (n: number): Body => ({
  model: "m",
  system: [{ type: "text", text: "sys" }],
  tools: [{ name: "Read" }],
  messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` })),
})

test("本文を元の形で読み戻し、同じメッセージは 1 度だけ保存する", () => {
  const store = openStore(join(dir, "a.db"))
  const id1 = store.add(entry("a", "2026-11-14T00:00:00Z"), body(2), "r1")
  const id2 = store.add(entry("a", "2026-11-14T00:01:00Z"), body(3), "r2")
  expect(store.body(id2)).toEqual(body(3))
  expect(store.body(id1)).toEqual(body(2))
  expect(store.reply(id1)).toBe("r1")
  // system・tools・メッセージ 3 種・返答 2 つ。2 回目の system・tools・m0・m1 は同じ物を指す
  expect(store.blobCount()).toBe(7)
  store.close()
})

test("セッションで絞り込み、一覧を出し、消したあとに残った行の本文は読める", () => {
  const store = openStore(join(dir, "b.db"))
  store.add(entry("a", "2026-11-13T00:00:00Z"), body(2), "r")
  const keep = store.add(entry("b", "2026-11-14T00:00:00Z"), body(2), "r")
  expect(store.entries("a").map(e => e.session)).toEqual(["a"])
  expect(store.sessions().map(s => [s.session, s.n])).toEqual([
    ["b", 1],
    ["a", 1],
  ])
  expect(store.purge("2026-11-14T00:00:00Z")).toBe(1)
  expect(store.entries().map(e => e.id)).toEqual([keep])
  expect(store.body(keep)).toEqual(body(2))
  expect(store.purge()).toBe(1)
  expect(store.entries()).toEqual([])
  store.close()
})

test("表示の名前は join の名前、URL の名前、session_id の頭 8 字の順で決まり、名前が変われば過去の行も変わる", () => {
  const store = openStore(join(dir, "c.db"))
  const e = (session: string, sessionId: string) => ({ ...entry(session, "2026-11-14T00:00:00Z"), sessionId })
  store.add(e("unnamed", "12345678-aaaa"), body(2), "r")
  store.add(e("viaurl", "ffffffff-bbbb"), body(2), "r")
  store.add(e("unnamed", "99999999-cccc"), body(2), "r")
  expect(store.entries().map(x => x.session)).toEqual(["12345678", "viaurl", "99999999"])
  store.setName("12345678-aaaa", "sub1_work")
  store.setName("ffffffff-bbbb", "sub2_work")
  expect(store.entries().map(x => x.session)).toEqual(["sub1_work", "sub2_work", "99999999"])
  expect(store.entries("sub1_work")).toHaveLength(1)
  store.setName("12345678-aaaa", "renamed")
  expect(
    store
      .sessions()
      .map(x => x.session)
      .sort(),
  ).toEqual(["99999999", "renamed", "sub2_work"])
  store.purge()
  expect(store.sessions()).toEqual([])
  store.close()
})
