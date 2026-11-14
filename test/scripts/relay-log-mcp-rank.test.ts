import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Body, Message } from "../../scripts/relay-log"
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
const wrap = (messages: Message[]) => messages.map(message => ({ session: "s", at, message }))

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
    at,
    session,
    sessionId: "",
    status: 200,
    ms: 1,
    stream: "s",
    diverge: "none",
    summary: {} as never,
    newResults: [],
    usage: {},
  })
  const m1 = use("a", "mcp__matomezu__actions", {})
  const m2 = result("a", "r")
  const body = (messages: Message[]): Body => ({ model: "m", messages })
  store.add(entry("one"), body([m1]), undefined)
  store.add(entry("one"), body([m1, m2]), undefined)
  store.add(entry("two"), body([use("z", "mcp__matomezu__join", {})]), undefined)
  expect(store.uniqueMessages().map(x => [x.session, x.message])).toEqual([
    ["one", m1],
    ["one", m2],
    ["two", use("z", "mcp__matomezu__join", {})],
  ])
  expect(store.uniqueMessages("one")).toHaveLength(2)
  store.close()
})

test("プラグインから入れた matomezu の道具も、前置きを外した名前で数える", () => {
  const calls = matomezuCalls(wrap([use("p", "mcp__plugin_matomezu_matomezu__actions", {}), result("p", "x")]))
  expect(calls.map(c => c.tool)).toEqual(["actions"])
})
