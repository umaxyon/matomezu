import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { claude, type Message, type MessagesBody } from "../../scripts/relay-log/clients/claude"
import { codex } from "../../scripts/relay-log/clients/codex"
import { matomezuCalls, rank } from "../../scripts/relay-log/mcp-rank"
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
const wrap = (messages: Message[]) => messages.map(item => ({ session: "s", client: "claude" as const, at, item }))

test("matomezu の結果だけを、perform は action ごとのキーで数え、同じ呼び出しの結果は 1 回だけ数える", () => {
  const calls = matomezuCalls(
    wrap([
      use("a", "mcp__matomezu__actions", {}),
      result("a", "x".repeat(100)),
      use("b", "mcp__matomezu__perform", { action: "page-add", book: "1" }),
      result("b", "x"),
      use("c", "Read", { file_path: "f" }),
      result("c", "x".repeat(500)),
      result("a", "x".repeat(100)),
    ]),
  )
  expect(calls.map(c => [c.tool, c.key])).toEqual([
    ["actions", "actions"],
    ["perform", "perform page-add"],
  ])
  expect(calls[0]?.chars).toBe(JSON.stringify([{ type: "text", text: "x".repeat(100) }]).length)
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

test("記録の読み出しは、送り直されたメッセージを 1 度だけ、最初に送られた所のセッションで返し、セッションで絞れる", () => {
  const store = openStore(join(dir, "a.db"))
  const entry = (session: string) => ({
    client: "claude" as const,
    at,
    session,
    sessionId: "",
    status: 200,
    ms: 1,
    stream: "s",
    diverge: "none",
    summary: {} as never,
    newResults: [],
    tokens: {},
    usage: {},
  })
  const m1 = use("a", "mcp__matomezu__actions", {})
  const m2 = result("a", "r")
  const body = (messages: Message[]): MessagesBody => ({ model: "m", messages })
  store.add(entry("one"), claude.split(body([m1])), undefined)
  store.add(entry("one"), claude.split(body([m1, m2])), undefined)
  store.add(entry("two"), claude.split(body([use("z", "mcp__matomezu__join", {})])), undefined)
  expect(store.uniqueItems().map(x => [x.session, x.item])).toEqual([
    ["one", m1],
    ["one", m2],
    ["two", use("z", "mcp__matomezu__join", {})],
  ])
  expect(store.uniqueItems("one")).toHaveLength(2)
  store.close()
})

test("プラグインから入れた matomezu の道具も、前置きを外した名前で数える", () => {
  const calls = matomezuCalls(wrap([use("p", "mcp__plugin_matomezu_matomezu__actions", {}), result("p", "x")]))
  expect(calls.map(c => c.tool)).toEqual(["actions"])
})

test("Codex の exec から呼んだ matomezu の道具も、その exec の結果で数える", () => {
  const items = [
    { type: "custom_tool_call", call_id: "c1", name: "exec", input: "text(await tools.mcp__matomezu__list_books({}))" },
    { type: "custom_tool_call_output", call_id: "c1", output: [{ type: "input_text", text: "x".repeat(30) }] },
    { type: "custom_tool_call", call_id: "c2", name: "exec", input: "text(await tools.exec_command({}))" },
    { type: "custom_tool_call_output", call_id: "c2", output: "y" },
  ].map(item => ({ session: "cx", client: "codex" as const, at, item }))
  const calls = matomezuCalls([...wrap([use("c1", "mcp__matomezu__view", {})]), ...items])
  expect(calls.map(c => [c.session, c.tool, c.chars])).toEqual([
    ["cx", "list_books", codex.toolResults(items[1]!.item)[0]!.chars],
  ])
})
