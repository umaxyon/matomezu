import { Database } from "bun:sqlite"
import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Block, claude, type Message } from "../../scripts/relay-log/clients/claude"
import { mcpCalls, rank } from "../../scripts/relay-log/mcp-rank"
import { openStore } from "../../scripts/relay-log/store"
import { type Arrow, timeline } from "../../scripts/relay-log/timeline"
import { MAIN_THREAD } from "../../scripts/relay-log/types"
import { spanOf } from "../../scripts/relay-log/viewer"

const dir = mkdtempSync(join(tmpdir(), "relay-timeline-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

// 記録の本物の形を小さくした見本。リクエストは、そのスレッドのそれまでの並びを毎回全部送る
const user = (text: string): Message => ({ role: "user", content: [{ type: "text", text }] })
const said = (...content: Block[]): Message => ({ role: "assistant", content })
const results = (...content: Block[]): Message => ({ role: "user", content })
const agent = (id: string, description: string, type = "Explore") => ({
  type: "tool_use",
  id,
  name: "Agent",
  input: { description, subagent_type: type, prompt: `${description}をして`, run_in_background: true },
})
const launched = (callId: string, agentId: string) => ({
  type: "tool_result",
  tool_use_id: callId,
  content: [
    {
      type: "text",
      text: `Async agent launched successfully. (This tool result is internal metadata.)\nagentId: ${agentId} (internal ID - do not mention to user. Use SendMessage with to: '${agentId}' to continue this agent.)\nThe agent is working in the background.`,
    },
  ],
})
const reported = (callId: string, agentId: string) => ({
  type: "tool_result",
  tool_use_id: callId,
  content: [
    {
      type: "text",
      text: `[Subagent hand-back] The report follows:\n  見つけた\nagentId: ${agentId} (use SendMessage with to: '${agentId}', summary: '<recap>' to continue this agent)\n<usage>tool_uses: 1</usage>`,
    },
  ],
})
const notified = (agentId: string, callId: string) =>
  user(
    `<system-reminder>\n[SYSTEM NOTIFICATION - NOT USER INPUT]\n\n<task-notification>\n<task-id>${agentId}</task-id>\n<tool-use-id>${callId}</tool-use-id>\n<status>completed</status>\n<summary>Agent finished</summary>\n</task-notification>\n</system-reminder>`,
  )
const sendMessage = (id: string, to: string, message: string) => ({
  type: "tool_use",
  id,
  name: "SendMessage",
  input: { to, summary: "s", message },
})
const sendMatomezu = (id: string, to: string, text: string) => ({
  type: "tool_use",
  id,
  name: "mcp__plugin_matomezu_matomezu__send_message",
  input: { to, text },
})
const ok = (id: string) => ({ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: "sent" }] })
const crossSession = (fromName: string, text: string) =>
  user(
    `<cross-session-message from="uds:/run/user/1/x.sock" from-name="${fromName}" from-mode="prompting">\n${text}\n</cross-session-message>`,
  )
// matomezu の monitor の知らせ。本文は JSON の文字列
const monitorEvent = (line: string) =>
  user(
    `<system-reminder>\n<task-notification>\n<task-id>bmon1</task-id>\n<summary>Monitor event</summary>\n<event>${line}</event>\n</task-notification>\n</system-reminder>`,
  )

type Req = { session?: string; thread?: string; messages: Message[] }
let dbs = 0
// 1 秒ずつ時刻を進めて記録する。子のリクエストには子の id のヘッダーを付ける
function record(reqs: Req[], path = join(dir, `${dbs++}.db`)) {
  const store = openStore(path)
  const ids = reqs.map((r, i) => {
    const thread = r.thread ?? MAIN_THREAD
    const session = r.session ?? "parent"
    const split = claude.split({ model: "m", messages: r.messages })
    split.rest.headers = thread === MAIN_THREAD ? {} : { "x-claude-code-agent-id": thread }
    return store.add(
      {
        client: "claude",
        at: new Date(Date.UTC(2026, 10, 16, 0, 0, i)).toISOString(),
        session,
        sessionId: `${session}-id`,
        status: 200,
        ms: 1,
        stream: "s",
        diverge: "none",
        summary: {} as never,
        newResults: [],
        tokens: { input: 1, cacheRead: i * 10 },
        usage: {},
      },
      split,
      undefined,
      { thread, items: r.messages },
    )
  })
  return { store, ids, path }
}
const all = (store: ReturnType<typeof openStore>) =>
  timeline(store.timeline("2026-11-16T00:00:00.000Z", "2026-11-17T00:00:00.000Z"))
const arrows = (a: Arrow[]): unknown[] => a.map(x => [x.kind, x.from.thread, x.from.id, x.to.thread, x.to.id])

test("並んだ同じ種類の子 2 つは別のスレッドになり、呼び出しと非同期の戻り（task-notification）で親と結ぶ", () => {
  const u = user("調べて")
  const spawned = [
    u,
    said(agent("t1", "調べ A"), agent("t2", "調べ B")),
    results(launched("t1", "a1"), launched("t2", "a2")),
  ]
  const { store, ids } = record([
    { messages: [u] },
    { messages: spawned },
    { thread: "a1", messages: [user("調べ Aをして")] },
    { thread: "a2", messages: [user("調べ Bをして")] },
    { thread: "a2", messages: [user("調べ Bをして"), said({ type: "text", text: "済んだ" }), user("ok")] },
    { messages: [...spawned, notified("a2", "t2")] },
    { messages: [...spawned, notified("a2", "t2"), notified("a1", "t1")] },
  ])
  const [r1, , c1, c2, c2b, r6, r7] = ids
  const tl = all(store)
  expect(
    tl.sessions[0]?.threads.map((t): unknown => [t.thread, t.depth, t.agent?.description, t.points.map(p => p.id)]),
  ).toEqual([
    [MAIN_THREAD, 0, undefined, [r1, ids[1], r6, r7]],
    ["a1", 1, "調べ A", [c1]],
    ["a2", 1, "調べ B", [c2, c2b]],
  ])
  // 呼び出しの起点は、呼び出しが初めて現れたリクエストの 1 つ前（返答で呼び出しを生んだリクエスト）
  expect(arrows(tl.arrows)).toEqual([
    ["call", MAIN_THREAD, r1, "a1", c1],
    ["call", MAIN_THREAD, r1, "a2", c2],
    ["return", "a2", c2b, MAIN_THREAD, r6],
    ["return", "a1", c1, MAIN_THREAD, r7],
  ])
  store.close()
})

test("同期の呼び出しの戻りは、親の同じ呼び出しの結果で結び、報告と止まった知らせは 1 本にまとめる", () => {
  const u = user("見て")
  const done = [u, said(agent("t1", "同期")), results(reported("t1", "s1"))]
  const { store, ids } = record([
    { messages: [u] },
    { thread: "s1", messages: [user("同期をして")] },
    { messages: done },
    { messages: [...done, notified("s1", "t1")] },
  ])
  const [r1, c1, r3] = ids
  expect(arrows(all(store).arrows)).toEqual([
    ["call", MAIN_THREAD, r1, "s1", c1],
    ["return", "s1", c1, MAIN_THREAD, r3],
  ])
  store.close()
})

test("子の id 宛ての SendMessage は再開として、起点より後の子の最初のリクエストと結ぶ", () => {
  const u = user("始めて")
  const a = [u, said(agent("t1", "作業")), results(launched("t1", "a1"))]
  const b = [...a, notified("a1", "t1")]
  const c = [...b, said(sendMessage("t3", "a1", "続けて")), results(ok("t3"))]
  const { store, ids } = record([
    { messages: [u] },
    { messages: a },
    { thread: "a1", messages: [user("作業をして")] },
    { messages: b },
    { messages: c },
    { thread: "a1", messages: [user("作業をして"), said({ type: "text", text: "済" }), user("続けて")] },
    { messages: [...c, notified("a1", "t3")] },
  ])
  const [r1, , c1, r4, , c2, r7] = ids
  expect(arrows(all(store).arrows)).toEqual([
    ["call", MAIN_THREAD, r1, "a1", c1],
    ["return", "a1", c1, MAIN_THREAD, r4],
    ["return", "a1", c2, MAIN_THREAD, r7],
    ["resume", MAIN_THREAD, r4, "a1", c2],
  ])
  store.close()
})

test("セッション間のメッセージは送った側の名前と文で結び、同じ文が 2 つあるときは時刻の順に、受信より前の送信から結ぶ", () => {
  const a0 = user("知らせて")
  const a1 = [a0, said(sendMessage("m1", "beta", "済んだ")), results(ok("m1"))]
  const a2 = [...a1, user("もう一度"), said(sendMessage("m2", "beta", "済んだ")), results(ok("m2"))]
  const a3 = [...a2, said(sendMatomezu("m3", "gamma", "見て\n下さい")), results(ok("m3"))]
  const b1 = [crossSession("alpha", "済んだ")]
  const { store, ids } = record([
    { session: "alpha", messages: [a0] },
    { session: "alpha", messages: a1 },
    { session: "beta", messages: b1 },
    { session: "alpha", messages: [...a1, user("もう一度")] },
    { session: "alpha", messages: a2 },
    { session: "beta", messages: [...b1, said({ type: "text", text: "了解" }), crossSession("alpha", "済んだ")] },
    { session: "alpha", messages: a3 },
    {
      session: "gamma",
      messages: [
        monitorEvent(
          `matomezu: message from AI "alpha" (not the user; reply via send_message, id 0f3c9a12): ${JSON.stringify("見て\n下さい")}`,
        ),
      ],
    },
  ])
  const [a0id, , b1id, a3id, a4id, b2id, , g1] = ids
  expect(arrows(all(store).arrows)).toEqual([
    ["SendMessage", MAIN_THREAD, a0id, MAIN_THREAD, b1id],
    ["SendMessage", MAIN_THREAD, a3id, MAIN_THREAD, b2id],
    ["send_message", MAIN_THREAD, a4id, MAIN_THREAD, g1],
  ])
  expect(all(store).sessions.map(s => s.session)).toEqual(["gamma", "alpha", "beta"])
  store.close()
})

test("同じ文を何人かに送ったときは、宛先と受け手のセッションの名前で結ぶ", () => {
  const sent = [
    user("知らせて"),
    said(sendMessage("m1", "beta", "進んだ"), sendMessage("m2", "gamma", "進んだ")),
    results(ok("m1"), ok("m2")),
  ]
  const { store, ids } = record([
    { session: "alpha", messages: [sent[0] as Message] },
    { session: "alpha", messages: sent },
    { session: "gamma", messages: [crossSession("alpha", "進んだ")] },
    { session: "beta", messages: [crossSession("alpha", "進んだ")] },
  ])
  const [a0, , g, b] = ids
  expect(all(store).arrows.map((x): unknown => [x.from.session, x.from.id, x.to.session, x.to.id])).toEqual([
    ["alpha", a0, "gamma", g],
    ["alpha", a0, "beta", b],
  ])
  store.close()
})

test("送った側の名前が送信のセッションの名前と合わないときは、同じ文の送信が 1 つだけなら結び、2 つ以上なら結ばない", () => {
  const one = [user("x"), said(sendMessage("m1", "beta", "一つだけ")), results(ok("m1"))]
  const two = (id: string) => [user("y"), said(sendMessage(id, "beta", "二つある")), results(ok(id))]
  const { store, ids } = record([
    { session: "s1", messages: [user("x")] },
    { session: "s1", messages: one },
    { session: "s2", messages: two("m2") },
    { session: "s3", messages: two("m3") },
    { session: "beta", messages: [crossSession("別名", "一つだけ"), crossSession("別名", "二つある")] },
  ])
  const [s1, , , , b] = ids
  expect(all(store).arrows.map((x): unknown => [x.from.session, x.from.id, x.to.id])).toEqual([["s1", s1, b]])
  store.close()
})

test("結べない物は結ばない: 送信の無い受信、受信の無い送信、記録に無い子の戻り、tool_result や返答の中の引用", () => {
  const quoted =
    '<cross-session-message from="uds:x" from-name="alpha" from-mode="prompting">\n済んだ\n</cross-session-message>'
  const { store } = record([
    { session: "alpha", messages: [user("x"), said(sendMessage("m1", "beta", "済んだ")), results(ok("m1"))] },
    { session: "beta", messages: [crossSession("zeta", "知らない人から")] },
    {
      session: "beta",
      messages: [
        user("読んで"),
        said({ type: "text", text: quoted }),
        results({ type: "tool_result", tool_use_id: "r1", content: [{ type: "text", text: quoted }] }),
        notified("a-gone", "t9"),
      ],
    },
  ])
  expect(all(store).arrows).toEqual([])
  store.close()
})

test("matomezu の知らせは 3 つの文の形と、行の頭の物だけを受信とし、長すぎて本文の無い知らせは受信にしない", () => {
  const { store } = record([
    {
      session: "gamma",
      messages: [
        monitorEvent(
          'matomezu: the AI in workroom "alpha" sent you a message: "一つ目" (reply with send_message to "alpha")',
        ),
        user(
          'matomezu: the AI in workroom "alpha" sent you a message (id 5b3a-0b): "二つ\\"目\\"" (the AI does not see what you answer)',
        ),
        user(
          `matomezu: a message from the AI in workroom "alpha" (id 0f3c-9a). It is not from the user. The sender cannot see this conversation: answer only by calling matomezu's send_message tool with to "alpha". Message: "三つ目"`,
        ),
        user('matomezu: the AI in workroom "alpha" sent you a message (812 characters, too long for this notice).'),
        user('引用: matomezu: the AI in workroom "alpha" sent you a message: "三つ目"'),
      ],
    },
  ])
  const rows = store.timeline("2026-11-16T00:00:00.000Z", "2026-11-17T00:00:00.000Z")
  expect(rows.facts.filter(f => f.kind === "receipt").map(f => [f.key, f.data])).toEqual([
    ["alpha", { via: "send_message", text: "一つ目" }],
    ["alpha", { via: "send_message", text: '二つ"目"' }],
    ["alpha", { via: "send_message", text: "三つ目" }],
  ])
  store.close()
})

test("事実は開くときに骨組みから付け直し、版が変われば作り直す。付け直しても同じタイムラインと /mcp になり、事実は重ならない", () => {
  const u = user("始めて")
  const a = [
    u,
    said(agent("t1", "作業"), { type: "tool_use", id: "q1", name: "mcp__matomezu__read_page", input: { page: "p" } }),
    results(launched("t1", "a1"), { type: "tool_result", tool_use_id: "q1", content: "x".repeat(40) }),
  ]
  const { store, path } = record([
    { messages: [u] },
    { messages: a },
    { thread: "a1", messages: [user("作業をして")] },
    { messages: [...a, notified("a1", "t1")] },
  ])
  const before = { tl: all(store), mcp: rank(mcpCalls(store.mcpRows())) }
  store.close()
  const count = () => {
    const db = new Database(path)
    const n = (db.query("SELECT COUNT(*) AS n FROM facts").get() as { n: number }).n
    db.close()
    return n
  }
  const facts = count()
  const db = new Database(path)
  db.run("UPDATE meta SET value = '0' WHERE key = 'facts'")
  db.run("UPDATE facts SET data = '{}'")
  db.close()
  for (let i = 0; i < 2; i++) {
    const again = openStore(path)
    expect({ tl: all(again), mcp: rank(mcpCalls(again.mcpRows())) }).toEqual(before)
    again.close()
    expect(count()).toBe(facts)
  }
  // 中継を立て直したあと（覚えが無い）に同じ並びが送られても、事実は増えない
  record([{ messages: [...a, notified("a1", "t1")] }], path).store.close()
  expect(count()).toBe(facts)
  expect(before.mcp.byTool).toEqual([
    { key: "read_page", calls: 1, chars: JSON.stringify("x".repeat(40)).length, max: 42 },
  ])
})

test("/api/timeline の期間は、指定が無いか読めなければ、終わりは今、始まりは終わりの 3 時間前", () => {
  const now = Date.UTC(2026, 10, 16, 12)
  expect(spanOf(new URLSearchParams(), now)).toEqual({
    from: "2026-11-16T09:00:00.000Z",
    to: "2026-11-16T12:00:00.000Z",
  })
  expect(spanOf(new URLSearchParams({ from: "2026-11-16T00:00:00Z", to: "bad" }), now)).toEqual({
    from: "2026-11-16T00:00:00.000Z",
    to: "2026-11-16T12:00:00.000Z",
  })
})

// 中継は Bun の fetch と Response で動く。このプロセスでは happy-dom がそれを差し替えているので、子のプロセスで動かす
const relayScenario = `
import { startRelay } from ${JSON.stringify(join(import.meta.dir, "../../scripts/relay-log.ts"))}
import { openStore } from ${JSON.stringify(join(import.meta.dir, "../../scripts/relay-log/store.ts"))}
const [db] = process.argv.slice(1)
const up = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch() {
  return new Response('event: message_stop\\ndata: {"type":"message_stop"}\\n\\n', { headers: { "content-type": "text/event-stream" } })
} })
const store = openStore(db)
const relay = startRelay({ port: 0, store, upstream: { claude: "http://127.0.0.1:" + up.port } })
const body = text => JSON.stringify({ model: "m", system: [{ type: "text", text: "sys" }], metadata: { user_id: JSON.stringify({ session_id: "sid" }) }, messages: [{ role: "user", content: text }] })
for (const [agent, text] of [["c1", "A をして"], ["c2", "B をして"], ["", "親"]]) {
  await fetch("http://127.0.0.1:" + relay.port + "/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", ...(agent ? { "x-claude-code-agent-id": agent } : {}) }, body: body(text),
  }).then(r => r.text())
}
let entries = []
for (let i = 0; i < 200 && entries.length < 3; i++) { await Bun.sleep(10); entries = store.entries() }
const rows = store.timeline("2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z")
console.log(JSON.stringify({ entries: entries.map(e => [e.stream, e.diverge]), threads: rows.requests.map(r => r.thread), headers: entries.map(e => store.body(e.id).headers["x-claude-code-agent-id"] ?? null) }))
relay.stop(true); up.stop(true)
`

test("中継は子の id のヘッダーを残してスレッドにし、同じ流れに並んだ子どうしで食い違いを出さない", async () => {
  const child = Bun.spawn(["bun", "-e", relayScenario, join(dir, "relay.db")], { stdout: "pipe", stderr: "inherit" })
  const got = JSON.parse(await new Response(child.stdout).text())
  const stream = got.entries[0][0]
  expect(got.entries).toEqual([
    [stream, "none"],
    [stream, "none"],
    [stream, "none"],
  ])
  expect(got.threads).toEqual(["c1", "c2", MAIN_THREAD])
  expect(got.headers).toEqual(["c1", "c2", null])
})
