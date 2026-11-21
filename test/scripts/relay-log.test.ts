import { afterAll, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { headersForLog, report, routeOf } from "../../scripts/relay-log"
import { claude, type MessagesBody } from "../../scripts/relay-log/clients/claude"
import { codex } from "../../scripts/relay-log/clients/codex"
import type { Entry } from "../../scripts/relay-log/types"

test("記録するヘッダーは、AI ごとに許可した物のほかは値を残さない", () => {
  const h = new Headers({
    authorization: "Bearer secret-token",
    "x-api-key": "sk-ant-secret",
    "chatgpt-account-id": "secret-account",
    cookie: "a=b",
    "anthropic-beta": "oauth-2025-04-20",
    "user-agent": "claude-cli",
    "session-id": "s1",
    "x-claude-code-agent-id": "a1b2",
  })
  const a = headersForLog(h, claude.keepHeaders)
  expect(a.authorization).toBe("<dropped>")
  expect(a["x-api-key"]).toBe("<dropped>")
  expect(a.cookie).toBe("<dropped>")
  expect(a["anthropic-beta"]).toBe("oauth-2025-04-20")
  expect(a["x-claude-code-agent-id"]).toBe("a1b2")
  expect(JSON.stringify(a)).not.toContain("secret")
  const c = headersForLog(h, codex.keepHeaders)
  expect(c["chatgpt-account-id"]).toBe("<dropped>")
  expect(c["session-id"]).toBe("s1")
  expect(JSON.stringify(c)).not.toContain("secret")
})

test("道の頭で AI を決め、/s/<名前> からセッション名を取り、上流へ渡す道から外す", () => {
  const table: [string, ReturnType<typeof routeOf>][] = [
    ["/v1/messages", { client: "claude", session: "unnamed", path: "/v1/messages" }],
    ["/s/sub1_work/v1/messages", { client: "claude", session: "sub1_work", path: "/v1/messages" }],
    ["/s/bad name!/v1/messages", { client: "claude", session: "unnamed", path: "/v1/messages" }],
    ["/codex/responses", { client: "codex", session: "unnamed", path: "/responses" }],
    ["/codex/models", { client: "codex", session: "unnamed", path: "/models" }],
    ["/codex/s/sub2_work/responses", { client: "codex", session: "sub2_work", path: "/responses" }],
    ["/codex", { client: "codex", session: "unnamed", path: "/" }],
    ["/codexfoo/responses", { client: "claude", session: "unnamed", path: "/codexfoo/responses" }],
  ]
  expect(table.map(([p]) => [p, routeOf(p)])).toEqual(table)
})

test("report は AI の列を出し、usage はそろえた意味で、その AI に無い値と cache_control の印は - にする", () => {
  const e = (client: "claude" | "codex", tokens: Entry["tokens"], marks?: string[]): Entry => ({
    id: 1,
    client,
    at: "2026-11-16T00:00:00Z",
    session: "s",
    sessionId: "",
    status: 200,
    ms: 1,
    stream: "ab",
    diverge: "none",
    summary: { ...codex.summarize({}), ...(marks ? { marks } : {}) },
    newResults: [],
    tokens,
    usage: {},
  })
  const out = report([
    e("claude", { input: 3, cacheRead: 100, cacheNew: 20, output: 7 }, []),
    e("codex", { input: 100, cacheRead: 900, output: 7 }),
  ])
  expect(out).toContain("| # | AI | セッション |")
  expect(out).toContain("| 1 | claude | s | 00:00:00 | ab | ? | 0 | 3 | 100 | 20 | 7 |")
  expect(out).toContain("| 1 | codex | s | 00:00:00 | ab | ? | 0 | 100 | 900 | - | 7 |")
  expect(out).toContain("- cache_control: -")
})

const dir = mkdtempSync(join(tmpdir(), "relay-log-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const body = (): MessagesBody => ({
  model: "m",
  system: [{ type: "text", text: "sys" }],
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
  ],
})
const codexBody = {
  model: "gpt-x",
  input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    { type: "custom_tool_call", call_id: "c1", name: "exec", input: "text(await tools.mcp__matomezu__view({}))" },
    { type: "custom_tool_call_output", call_id: "c1", output: [{ type: "input_text", text: "v".repeat(20) }] },
  ],
}

// 中継は Bun の fetch と Response で動く。このプロセスでは happy-dom がそれを差し替えているので、子のプロセスで動かす。
// 偽の上流を AI ごとに立て、それぞれが受けた道と認証を返す
// どの子にも入れる頭。waitAdded は store.add を包み、中継が記録を n 件足したときに解ける
const scenarioHead = `
import { startRelay } from ${JSON.stringify(join(import.meta.dir, "../../scripts/relay-log.ts"))}
import { openStore } from ${JSON.stringify(join(import.meta.dir, "../../scripts/relay-log/store.ts"))}
const waitAdded = (store, n) => new Promise(resolve => {
  const add = store.add
  let count = 0
  store.add = (...a) => { const r = add(...a); if (++count === n) resolve(); return r }
})
`

const scenario = `${scenarioHead}
const [db, claudeBody, codexBody, claudeSse, codexSse] = process.argv.slice(1)
const seen = { claude: [], codex: [] }
const fake = (name, sse) => Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
  seen[name].push([req.method, new URL(req.url).pathname, req.headers.get("authorization") ?? ""])
  return new Response(sse, { headers: { "content-type": "text/event-stream" } })
} })
const up = { claude: fake("claude", claudeSse), codex: fake("codex", codexSse) }
const store = openStore(db)
const added = waitAdded(store, 2)
const relay = startRelay({ port: 0, store, upstream: {
  claude: "http://127.0.0.1:" + up.claude.port, codex: "http://127.0.0.1:" + up.codex.port + "/backend",
} })
const base = "http://127.0.0.1:" + relay.port
const health = await (await fetch(base + "/__relay/health")).text()
const post = (path, body, auth) => fetch(base + path, {
  method: "POST", headers: { authorization: auth, "content-type": "application/json", "session-id": "cx-session", "thread-id": "cx-thread", "chatgpt-account-id": "secret-account" }, body,
}).then(r => r.text())
const texts = [
  await post("/s/sub1_work/v1/messages", claudeBody, "Bearer secret-claude"),
  await post("/codex/s/sub2_work/responses", codexBody, "Bearer secret-codex"),
  await (await fetch(base + "/codex/models")).text(),
]
await added
const entries = store.entries()
const stored = entries.map(e => store.body(e.id))
console.log(JSON.stringify({ health, texts, seen, entries, stored, replies: entries.map(e => store.reply(e.id)) }))
relay.stop(true); up.claude.stop(true); up.codex.stop(true)
`

test("中継は AI ごとの上流へ渡して返答をそのまま返し、AI とセッション名を付けて記録し、認証の値を残さない", async () => {
  const claudeSse =
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5,"cache_read_input_tokens":40}}}\n\n' +
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n'
  const codexSse =
    'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":50,"input_tokens_details":{"cached_tokens":40},"output_tokens":3}}}\n\n'
  const child = Bun.spawn(
    [
      "bun",
      "-e",
      scenario,
      join(dir, "log.db"),
      JSON.stringify(body()),
      JSON.stringify(codexBody),
      claudeSse,
      codexSse,
    ],
    { stdout: "pipe", stderr: "inherit" },
  )
  const got = JSON.parse(await new Response(child.stdout).text())
  expect(got.health).toBe("ok")
  expect(got.texts).toEqual([claudeSse, codexSse, codexSse])
  expect(got.seen).toEqual({
    claude: [["POST", "/v1/messages", "Bearer secret-claude"]],
    codex: [
      ["POST", "/backend/responses", "Bearer secret-codex"],
      ["GET", "/backend/models", ""],
    ],
  })
  const [a, c] = got.entries
  expect([a.client, a.session, c.client, c.session]).toEqual(["claude", "sub1_work", "codex", "sub2_work"])
  expect(a.tokens).toEqual({ input: 5, cacheRead: 40, output: 2 })
  expect(c.tokens).toEqual({ input: 10, cacheRead: 40, output: 3 })
  expect(c.sessionId).toBe("cx-session")
  expect(a.newResults.map((r: { id: string }) => r.id)).toEqual(["t1", "t2"])
  expect(c.newResults).toEqual([{ id: "c1", tool: "mcp__matomezu__view", chars: 53 }])
  expect(got.stored[0].messages).toEqual(body().messages)
  expect(got.stored[1].input).toEqual(codexBody.input)
  expect(got.stored[1].headers["session-id"]).toBe("cx-session")
  expect(got.replies).toEqual([claudeSse, codexSse])
  expect(JSON.stringify(got.stored)).not.toContain("secret")
  expect(report(got.entries)).toContain("mcp__matomezu__read_page: 1 回、52 字")
  expect(report(got.entries)).toContain("mcp__matomezu__view: 1 回、53 字")
})

// 上流が最初のかけらを返したところで、呼び手が接続を切る（Claude Code の中断）
const abortScenario = `${scenarioHead}
const [db, body] = process.argv.slice(1)
const upstream = Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 0, fetch() {
  const stream = new ReadableStream({ async start(c) {
    c.enqueue(new TextEncoder().encode('event: message_start\\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\\n\\n'))
  } })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
} })
const store = openStore(db)
const added = waitAdded(store, 1)
const relay = startRelay({ port: 0, store, upstream: { claude: "http://127.0.0.1:" + upstream.port } })
const ac = new AbortController()
const res = await fetch("http://127.0.0.1:" + relay.port + "/v1/messages", {
  method: "POST", headers: { "content-type": "application/json" }, body, signal: ac.signal,
})
const reader = res.body.getReader()
await reader.read()
ac.abort()
await added
const entries = store.entries()
const health = await (await fetch("http://127.0.0.1:" + relay.port + "/__relay/health")).text()
console.log(JSON.stringify({ health, entries }))
relay.stop(true); upstream.stop(true)
process.exit(0)
`

test("呼び手が返答の途中で接続を切っても中継は落ちず、中断した呼び出しを記録する", async () => {
  const child = Bun.spawn(["bun", "-e", abortScenario, join(dir, "abort.db"), JSON.stringify(body())], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ code, err: err.includes("AbortError") ? err.slice(0, 300) : "" }).toEqual({ code: 0, err: "" })
  const got = JSON.parse(out)
  expect(got.health).toBe("ok")
  expect(got.entries.map((e: { aborted?: boolean; usage: unknown }) => [e.aborted, e.usage])).toEqual([
    [true, { input_tokens: 5 }],
  ])
})

// Codex は response.completed を受けると、上流が閉じる前に接続を切る。content-type が SSE でなくても本文の頭で SSE と読む
const endScenario = `${scenarioHead}
const [db, body] = process.argv.slice(1)
const upstream = Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 0, fetch() {
  const stream = new ReadableStream({ async start(c) {
    c.enqueue(new TextEncoder().encode('event: response.completed\\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":9,"output_tokens":1}}}\\n\\n'))
  } })
  return new Response(stream, { headers: { "content-type": "application/octet-stream" } })
} })
const store = openStore(db)
const added = waitAdded(store, 1)
const relay = startRelay({ port: 0, store, upstream: { codex: "http://127.0.0.1:" + upstream.port } })
const ac = new AbortController()
const res = await fetch("http://127.0.0.1:" + relay.port + "/codex/responses", {
  method: "POST", headers: { "content-type": "application/json" }, body, signal: ac.signal,
})
const reader = res.body.getReader()
await reader.read()
ac.abort()
await added
const entries = store.entries()
console.log(JSON.stringify({ entries }))
relay.stop(true); upstream.stop(true)
process.exit(0)
`

test("返答の終わりのイベントのあとで呼び手が接続を切っても中断にせず、content-type が SSE でない SSE からも usage を拾う", async () => {
  const child = Bun.spawn(["bun", "-e", endScenario, join(dir, "end.db"), JSON.stringify(codexBody)], {
    stdout: "pipe",
    stderr: "inherit",
  })
  const got = JSON.parse(await new Response(child.stdout).text())
  expect(got.entries.map((e: Entry) => [e.client, e.aborted, e.tokens])).toEqual([
    ["codex", undefined, { input: 9, output: 1 }],
  ])
})

// 起動の sh は、PATH の頭に置いた偽の curl・bun・sleep・claude・codex で動かす（本物の中継には触れない）。
// 偽の curl は up のファイルがあれば中継が動いているとし、偽の bun は FAKE_START があれば up を作る
function fakeBin(state: string) {
  const bin = join(state, "bin")
  mkdirSync(bin, { recursive: true })
  const put = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  put("curl", `[ -f "${state}/up" ]`)
  put("bun", `echo "$*" >>"${state}/bun.log"; if [ -n "\${FAKE_START:-}" ]; then touch "${state}/up"; fi`)
  put("sleep", "/usr/bin/sleep 0.02")
  for (const ai of ["claude", "codex"])
    put(ai, `printf '%s\\n' "$@" >"${state}/${ai}.args"; echo "\${ANTHROPIC_BASE_URL:-}" >"${state}/${ai}.env"`)
  return bin
}

function runSh(script: string, args: string[], env: Record<string, string> = {}, up = true) {
  const state = mkdtempSync(join(dir, "sh-"))
  const bin = fakeBin(state)
  if (up) writeFileSync(join(state, "up"), "")
  const r = Bun.spawnSync(["bash", join(import.meta.dir, "../../scripts", script), ...args], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RELAY_PORT: "1",
      VIEW_PORT: "2",
      RELAY_DB: join(state, "db", "central.db"),
      ...env,
    },
  })
  const read = (f: string) => {
    try {
      return readFileSync(join(state, f), "utf8")
    } catch {
      return undefined
    }
  }
  return {
    code: r.exitCode,
    err: r.stderr.toString(),
    state,
    read,
    args: (ai: string) => read(`${ai}.args`)?.split("\n").slice(0, -1),
  }
}

test("codex-relay.sh は窓口 matomezu_relay を -c で足し、--no-daemon が無ければ足して codex を起動する", () => {
  const provider = (base: string) =>
    `model_providers.matomezu_relay={name="matomezu_relay",base_url="${base}",requires_openai_auth=true,wire_api="responses"}`
  const named = runSh("codex-relay.sh", ["exec", "hi"], { RELAY_NAME: "sub2_work" })
  expect(named.args("codex")).toEqual([
    "--no-daemon",
    "-c",
    "model_provider=matomezu_relay",
    "-c",
    provider("http://127.0.0.1:1/codex/s/sub2_work"),
    "exec",
    "hi",
  ])
  expect(named.read("bun.log")).toBeUndefined()
  const given = runSh("codex-relay.sh", ["--no-daemon", "exec", "hi"])
  expect(given.args("codex")).toEqual([
    "-c",
    "model_provider=matomezu_relay",
    "-c",
    provider("http://127.0.0.1:1/codex"),
    "--no-daemon",
    "exec",
    "hi",
  ])
})

test("中継を立てられなければ、警告を出して中継なしで AI を起動する", () => {
  const r = runSh("codex-relay.sh", ["exec", "hi"], {}, false)
  expect(r.args("codex")).toEqual(["exec", "hi"])
  expect(r.err).toContain("中継なしで codex を起動する")
  expect(r.read("bun.log")).toContain("relay-log.ts serve --db")
})

test("claude-relay.sh は中継を立て、ANTHROPIC_BASE_URL を中継にして claude を起動する", () => {
  const r = runSh("claude-relay.sh", ["-p", "hi"], { FAKE_START: "1", RELAY_NAME: "sub1_work" }, false)
  expect(r.read("bun.log")).toContain(`--port 1 --view-port 2 --pid-file ${join(r.state, "db", "server.pid")}`)
  expect(r.args("claude")).toEqual(["-p", "hi"])
  expect(r.read("claude.env")).toBe("http://127.0.0.1:1/s/sub1_work\n")
})

test("--stop はどちらの sh からでも同じ中継を止め、AI は起動しない。RELAY_NAME が決まりに合わなければ起動しない", async () => {
  for (const script of ["claude-relay.sh", "codex-relay.sh"]) {
    const target = Bun.spawn(["/usr/bin/sleep", "30"])
    const state = mkdtempSync(join(dir, "stop-"))
    mkdirSync(join(state, "db"))
    writeFileSync(join(state, "db", "server.pid"), `${target.pid}\n`)
    const r = runSh(script, ["--stop"], { RELAY_DB: join(state, "db", "central.db") })
    expect([r.code, r.args("claude"), r.args("codex")]).toEqual([0, undefined, undefined])
    await target.exited
    expect(target.signalCode).toBe("SIGTERM")
  }
  const bad = runSh("codex-relay.sh", ["exec"], { RELAY_NAME: "bad name" })
  expect([bad.code, bad.args("codex")]).toEqual([2, undefined])
})
