import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type Block,
  type Body,
  divergeAt,
  headersForLog,
  report,
  routeOf,
  sessionIdOf,
  summarize,
  UsageReader,
} from "../../scripts/relay-log"

test("記録するヘッダーは、許可した物のほかは値を残さない", () => {
  const h = new Headers({
    authorization: "Bearer secret-token",
    "x-api-key": "sk-ant-secret",
    cookie: "a=b",
    "anthropic-beta": "oauth-2025-04-20",
    "user-agent": "claude-cli",
  })
  const out = headersForLog(h)
  expect(out.authorization).toBe("<dropped>")
  expect(out["x-api-key"]).toBe("<dropped>")
  expect(out.cookie).toBe("<dropped>")
  expect(out["anthropic-beta"]).toBe("oauth-2025-04-20")
  expect(JSON.stringify(out)).not.toContain("secret")
})

test("SSE の usage を、行の途中で切れたチャンクからも拾う", () => {
  const sse =
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":3,"cache_read_input_tokens":100,"cache_creation_input_tokens":20,"cache_creation":{"ephemeral_1h_input_tokens":20}}}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n' +
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n'
  const r = new UsageReader()
  for (let i = 0; i < sse.length; i += 13) r.feed(sse.slice(i, i + 13))
  r.end()
  expect(r.usage).toEqual({
    input_tokens: 3,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 20,
    "cache_creation.ephemeral_1h_input_tokens": 20,
    output_tokens: 7,
  })
})

const body = (extra: Body["messages"] = []): Body & { messages: NonNullable<Body["messages"]> } => ({
  model: "m",
  system: [{ type: "text", text: "sys", cache_control: { type: "ephemeral", ttl: "1h" } }],
  tools: [{ name: "Read" }, { name: "mcp__matomezu__read_page" }],
  messages: [
    { role: "user", content: "hi" },
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t1", name: "mcp__matomezu__read_page", input: {} },
        { type: "tool_use", id: "t2", name: "Read", input: {} },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "x".repeat(50) },
        { type: "tool_result", tool_use_id: "t2", content: "y".repeat(10) },
      ],
    },
    ...extra,
  ],
})

test("tool_result をツールの名前で数え、matomezu の分を分ける", () => {
  const s = summarize(body())
  expect(s.results.map(r => r.tool)).toEqual(["mcp__matomezu__read_page", "Read"])
  expect(s.matomezuResultChars).toBe(52)
  expect(s.resultChars).toBe(64)
  expect(s.matomezuToolsN).toBe(1)
  expect(s.marks).toEqual(["system[0]:1h"])
})

test("前置きが最初に食い違った所を、tools・system・メッセージの順で出す", () => {
  const a = summarize(body()).prefix
  expect(divergeAt(undefined, a)).toBe("none")
  expect(divergeAt(a, summarize(body([{ role: "user", content: "next" }])).prefix)).toBe("none")
  const changed = body()
  ;(changed.messages[2]!.content as Block[])[0]!.content = "short"
  expect(divergeAt(a, summarize(changed).prefix)).toBe("msg2")
  expect(divergeAt(a, summarize({ ...body(), system: "other" }).prefix)).toBe("system")
})

test("キャッシュで同じに扱われる違い（印の移動・文字列とブロック・defer_loading のツール）は食い違いにしない", () => {
  const a = summarize(body()).prefix
  const marked = body()
  marked.messages[0] = { role: "user", content: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }] }
  marked.tools?.push({ name: "mcp__matomezu__view", defer_loading: true })
  expect(divergeAt(a, summarize(marked).prefix)).toBe("none")
})

const dir = mkdtempSync(join(tmpdir(), "relay-log-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

test("中継の URL の /s/<名前> からセッション名を取り、上流へ渡す道から外す", () => {
  expect(routeOf("/s/sub1_work/v1/messages")).toEqual({ session: "sub1_work", path: "/v1/messages" })
  expect(routeOf("/v1/messages")).toEqual({ session: "unnamed", path: "/v1/messages" })
  expect(routeOf("/s/bad name!/v1/messages").session).toBe("unnamed")
  expect(sessionIdOf({ metadata: { user_id: JSON.stringify({ session_id: "abc" }) } })).toBe("abc")
  expect(sessionIdOf({})).toBe("")
})

// 中継は Bun の fetch と Response で動く。このプロセスでは happy-dom がそれを差し替えているので、子のプロセスで動かす
const scenario = `
import { startRelay } from ${JSON.stringify(join(import.meta.dir, "../../scripts/relay-log.ts"))}
import { openStore } from ${JSON.stringify(join(import.meta.dir, "../../scripts/relay-log/store.ts"))}
const [db, body, sse] = process.argv.slice(1)
let seenAuth = ""
let seenPath = ""
const upstream = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
  seenAuth = req.headers.get("authorization") ?? ""
  seenPath = new URL(req.url).pathname
  return new Response(sse, { headers: { "content-type": "text/event-stream" } })
} })
const store = openStore(db)
const relay = startRelay({ port: 0, store, upstream: "http://127.0.0.1:" + upstream.port })
const health = await (await fetch("http://127.0.0.1:" + relay.port + "/__relay/health")).text()
const res = await fetch("http://127.0.0.1:" + relay.port + "/s/sub1_work/v1/messages", {
  method: "POST", headers: { authorization: "Bearer secret-token", "content-type": "application/json" }, body,
})
const text = await res.text()
let entries = []
for (let i = 0; i < 200 && !entries.length; i++) { await Bun.sleep(10); entries = store.entries() }
console.log(JSON.stringify({ health, text, seenAuth, seenPath, entries, stored: store.body(entries[0].id), reply: store.reply(entries[0].id) }))
relay.stop(true); upstream.stop(true)
`

test("中継は返答をそのまま渡し、セッション名を付けて SQLite に記録し、認証の値を残さない", async () => {
  const sse =
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5,"cache_read_input_tokens":40}}}\n\n' +
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n'
  const child = Bun.spawn(["bun", "-e", scenario, join(dir, "log.db"), JSON.stringify(body()), sse], {
    stdout: "pipe",
    stderr: "inherit",
  })
  const got = JSON.parse(await new Response(child.stdout).text())
  expect(got.health).toBe("ok")
  expect(got.text).toBe(sse)
  expect(got.seenAuth).toBe("Bearer secret-token")
  expect(got.seenPath).toBe("/v1/messages")
  const entry = got.entries[0]
  expect(entry.session).toBe("sub1_work")
  expect(entry.usage).toEqual({ input_tokens: 5, cache_read_input_tokens: 40, output_tokens: 2 })
  expect(entry.newResults.map((r: { id: string }) => r.id)).toEqual(["t1", "t2"])
  expect(got.stored.messages).toEqual(body().messages)
  expect(got.reply).toBe(sse)
  expect(JSON.stringify(got.stored)).not.toContain("secret-token")
  expect(report(got.entries)).toContain("mcp__matomezu__read_page: 1 回、52 字")
})
