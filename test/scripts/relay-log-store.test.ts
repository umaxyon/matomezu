import { Database } from "bun:sqlite"
import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { claude, type MessagesBody } from "../../scripts/relay-log/clients/claude"
import { codex, type ResponsesBody } from "../../scripts/relay-log/clients/codex"
import { openStore } from "../../scripts/relay-log/store"

const dir = mkdtempSync(join(tmpdir(), "relay-store-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const entry = (session: string, at: string) => ({
  client: "claude" as const,
  at,
  session,
  sessionId: "sid",
  status: 200,
  ms: 1,
  stream: "s",
  diverge: "none",
  summary: {} as never,
  newResults: [],
  tokens: {},
  usage: {},
})
const body = (n: number): MessagesBody => ({
  model: "m",
  system: [{ type: "text", text: "sys" }],
  tools: [{ name: "Read" }],
  messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` })),
})

test("本文を元の形で読み戻し、同じメッセージは 1 度だけ保存する", () => {
  const store = openStore(join(dir, "a.db"))
  const id1 = store.add(entry("a", "2026-11-14T00:00:00Z"), claude.split(body(2)), "r1")
  const id2 = store.add(entry("a", "2026-11-14T00:01:00Z"), claude.split(body(3)), "r2")
  expect(store.body(id2)).toEqual(body(3))
  expect(store.body(id1)).toEqual(body(2))
  expect(store.reply(id1)).toBe("r1")
  // system・tools・メッセージ 3 種・返答 2 つ。2 回目の system・tools・m0・m1 は同じ物を指す
  expect(store.blobCount()).toBe(7)
  store.close()
})

test("セッションで絞り込み、一覧を出し、消したあとに残った行の本文は読める", () => {
  const store = openStore(join(dir, "b.db"))
  store.add(entry("a", "2026-11-13T00:00:00Z"), claude.split(body(2)), "r")
  const keep = store.add(entry("b", "2026-11-14T00:00:00Z"), claude.split(body(2)), "r")
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
  store.add(e("unnamed", "12345678-aaaa"), claude.split(body(2)), "r")
  store.add(e("viaurl", "ffffffff-bbbb"), claude.split(body(2)), "r")
  store.add(e("unnamed", "99999999-cccc"), claude.split(body(2)), "r")
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

test("起動のときの枠の確かめは、前に記録した行にも開くときに印を付ける", () => {
  const path = join(dir, "d.db")
  const store = openStore(path)
  const quota: MessagesBody = { model: "m", max_tokens: 1, messages: [{ role: "user", content: "quota" }] }
  const id = store.add({ ...entry("a", "2026-11-14T00:00:00Z"), status: 429 }, claude.split(quota), undefined)
  const other = store.add({ ...entry("a", "2026-11-14T00:00:01Z"), status: 429 }, claude.split(body(1)), undefined)
  store.close()
  const again = openStore(path)
  const probes = Object.fromEntries(again.entries().map(e => [e.id, e.probe]))
  expect(probes).toEqual({ [id]: "quota", [other]: undefined })
  again.close()
})

test("Codex の本文も元の形で読み戻し、input の項目を 1 度だけ保存し、AI で絞り込める", () => {
  const store = openStore(join(dir, "e.db"))
  const cx = (n: number): ResponsesBody => ({
    model: "gpt-x",
    stream: true,
    input: [
      { type: "additional_tools", tools: [{ type: "namespace", name: "functions", tools: [] }] },
      ...Array.from({ length: n }, (_, i) => ({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `m${i}` }],
      })),
    ],
  })
  const e = {
    ...entry("unnamed", "2026-11-14T00:00:00Z"),
    client: "codex" as const,
    sessionId: "01a1e1f0-0000-7000-8000-00000000abcd",
  }
  const id1 = store.add(e, codex.split(cx(1)), "r1")
  const id2 = store.add(e, codex.split(cx(2)), "r2")
  store.add(entry("a", "2026-11-14T00:00:00Z"), claude.split(body(1)), "r3")
  expect(store.body(id1)).toEqual(cx(1))
  expect(store.body(id2)).toEqual(cx(2))
  expect(store.clientOf(id2)).toBe("codex")
  // 道具の説明・m0・m1・返答 3 つ・Claude の system・tools・m0
  expect(store.blobCount()).toBe(9)
  // Codex の session_id は頭が時刻なので、後ろの 8 字を名前にする
  expect(store.entries(undefined, "codex").map(x => [x.client, x.session])).toEqual([
    ["codex", "0000abcd"],
    ["codex", "0000abcd"],
  ])
  expect(store.sessions("claude").map(x => x.session)).toEqual(["a"])
  expect(store.uniqueItems(undefined, "codex")).toHaveLength(3)
  store.close()
})

test("AI の列・名前付きの骨組み・そろえた usage が無い行を、開くときに Claude Code の行として移す", () => {
  const path = join(dir, "old.db")
  const old = new Database(path)
  old.run("CREATE TABLE blobs (hash TEXT PRIMARY KEY, data TEXT NOT NULL)")
  old.run(
    "CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, session TEXT NOT NULL, session_id TEXT NOT NULL DEFAULT '', entry TEXT NOT NULL, skeleton TEXT, reply TEXT)",
  )
  const b = body(2)
  const blobs: Record<string, unknown> = { hs: b.system, ht: b.tools, m0: b.messages?.[0], m1: b.messages?.[1] }
  for (const [h, v] of Object.entries(blobs)) old.query("INSERT INTO blobs VALUES (?, ?)").run(h, JSON.stringify(v))
  const {
    client: _,
    tokens: __,
    ...oldEntry
  } = {
    ...entry("unnamed", "2026-11-14T00:00:00Z"),
    usage: { input_tokens: 3, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 7 },
  }
  old
    .query("INSERT INTO requests (at, session, session_id, entry, skeleton) VALUES (?, ?, ?, ?, ?)")
    .run(
      oldEntry.at,
      oldEntry.session,
      "12345678-aaaa",
      JSON.stringify(oldEntry),
      JSON.stringify({ rest: { model: "m" }, system: "hs", tools: "ht", messages: ["m0", "m1"] }),
    )
  old.close()
  for (let i = 0; i < 2; i++) {
    const store = openStore(path)
    const [e] = store.entries()
    expect(e?.client).toBe("claude")
    expect(e?.tokens).toEqual({ input: 3, cacheRead: 100, cacheNew: 20, output: 7 })
    expect(store.body(e!.id)).toEqual(b)
    expect(store.uniqueItems()).toHaveLength(2)
    expect(store.purge("2000-01-01T00:00:00Z")).toBe(0)
    expect(store.blobCount()).toBe(4)
    store.close()
  }
})
