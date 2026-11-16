import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { claude, type Message, type MessagesBody } from "../../scripts/relay-log/clients/claude"
import { codex } from "../../scripts/relay-log/clients/codex"
import { mcpCalls, rank } from "../../scripts/relay-log/mcp-rank"
import { openStore } from "../../scripts/relay-log/store"

const dir = mkdtempSync(join(tmpdir(), "relay-mcp-rank-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const use = (id: string, name: string, input: unknown): Message => ({
  role: "assistant",
  content: [{ type: "tool_use", id, name, input }],
})
const result = (id: string, text: string): Message => ({
  role: "user",
  content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }],
})
const at = "2026-11-14T00:00:00Z"
const entry = (session: string, client: "claude" | "codex" = "claude") => ({
  client,
  at,
  session,
  sessionId: `${session}-id`,
  status: 200,
  ms: 1,
  stream: "s",
  diverge: "none",
  summary: {} as never,
  newResults: [],
  tokens: {},
  usage: {},
})
const body = (messages: Message[]): MessagesBody => ({ model: "m", messages })
let n = 0
// 送り直しをまねて、伸びていく並びを 1 項目ずつ記録する
function recorded(messages: Message[], session = "s") {
  const store = openStore(join(dir, `${n++}.db`))
  for (let i = 1; i <= messages.length; i++)
    store.add(entry(session), claude.split(body(messages.slice(0, i))), undefined)
  return store
}

test("matomezu の結果だけを、perform は action ごとのキーで数え、同じ呼び出しの結果は 1 回だけ数える", () => {
  const store = recorded([
    use("a", "mcp__matomezu__actions", {}),
    result("a", "x".repeat(100)),
    use("b", "mcp__matomezu__perform", { action: "page-add", book: "1" }),
    result("b", "x"),
    use("c", "Read", { file_path: "f" }),
    result("c", "x".repeat(500)),
    result("a", "x".repeat(100)),
  ])
  const calls = mcpCalls(store.mcpRows())
  expect(calls.map(c => [c.tool, c.key])).toEqual([
    ["actions", "actions"],
    ["perform", "perform page-add"],
  ])
  expect(calls[0]?.chars).toBe(JSON.stringify([{ type: "text", text: "x".repeat(100) }]).length)
  store.close()
})

test("ツールごとの合計と、1 回ずつの上位を大きい順に並べる", () => {
  const call = (key: string, chars: number) => ({ session: "s", at, tool: key, key, input: {}, chars })
  const r = rank([call("read_page", 10), call("actions", 30), call("read_page", 25), call("join", 5)], 2)
  expect(r.byTool).toEqual([
    { key: "read_page", calls: 2, chars: 35, max: 25 },
    { key: "actions", calls: 1, chars: 30, max: 30 },
    { key: "join", calls: 1, chars: 5, max: 5 },
  ])
  expect(r.top.map(c => c.chars)).toEqual([30, 25])
})

test("結果は最初に送られたリクエストのセッションと時刻で数え、セッションで絞れる", () => {
  const store = openStore(join(dir, "sessions.db"))
  const m1 = use("a", "mcp__matomezu__actions", {})
  const m2 = result("a", "r")
  store.add({ ...entry("one"), at: "2026-11-14T00:00:01Z" }, claude.split(body([m1])), undefined)
  store.add({ ...entry("one"), at: "2026-11-14T00:00:02Z" }, claude.split(body([m1, m2])), undefined)
  store.add({ ...entry("one"), at: "2026-11-14T00:00:03Z" }, claude.split(body([m1, m2])), undefined)
  store.add(entry("two"), claude.split(body([use("z", "mcp__matomezu__join", {}), result("z", "j")])), undefined)
  expect(mcpCalls(store.mcpRows()).map(c => [c.session, c.tool, c.at])).toEqual([
    ["one", "actions", "2026-11-14T00:00:02Z"],
    ["two", "join", at],
  ])
  expect(mcpCalls(store.mcpRows("one")).map(c => c.tool)).toEqual(["actions"])
  store.close()
})

test("プラグインから入れた matomezu の道具も、前置きを外した名前で数える", () => {
  const store = recorded([use("p", "mcp__plugin_matomezu_matomezu__actions", {}), result("p", "x")])
  expect(mcpCalls(store.mcpRows()).map(c => c.tool)).toEqual(["actions"])
  store.close()
})

test("Codex の exec から呼んだ matomezu の道具も、その exec の結果で数える", () => {
  const items = [
    { type: "custom_tool_call", call_id: "c1", name: "exec", input: "text(await tools.mcp__matomezu__list_books({}))" },
    { type: "custom_tool_call_output", call_id: "c1", output: [{ type: "input_text", text: "x".repeat(30) }] },
    { type: "custom_tool_call", call_id: "c2", name: "exec", input: "text(await tools.exec_command({}))" },
    { type: "custom_tool_call_output", call_id: "c2", output: "y" },
  ]
  const store = openStore(join(dir, "codex.db"))
  store.add(entry("cx", "codex"), codex.split({ model: "g", input: items }), undefined)
  expect(mcpCalls(store.mcpRows()).map(c => [c.session, c.tool, c.chars])).toEqual([
    ["cx", "list_books", codex.toolResults(items[1])[0]!.chars],
  ])
  store.close()
})
