import { expect, test } from "bun:test"
import {
  classify,
  codex,
  divergeAt,
  execToolName,
  type Item,
  parseReply,
  type ResponsesBody,
  summarize,
  tokens,
  workroomNameOf,
} from "../../scripts/relay-log/clients/codex"
import { UsageReader } from "../../scripts/relay-log/common"

// Codex が送る本文の形を短くした物（道具の説明・指示・会話・exec の呼び出しと結果）
const text = (t: string) => ({ type: "input_text", text: t })
const message = (role: string, ...texts: string[]): Item => ({ type: "message", role, content: texts.map(text) })
const call = (id: string, input: string): Item => ({ type: "custom_tool_call", call_id: id, name: "exec", input })
const output = (id: string, out: string): Item => ({
  type: "custom_tool_call_output",
  call_id: id,
  output: [text("Script completed\nOutput:\n"), text(out)],
})
const body = (extra: Item[] = []): ResponsesBody & { input: Item[] } => ({
  model: "gpt-x",
  stream: true,
  input: [
    {
      type: "additional_tools",
      role: "developer",
      tools: [
        { type: "namespace", name: "functions", tools: [{ type: "custom", name: "exec" }] },
        { type: "namespace", name: "collaboration", tools: [{ type: "function", name: "spawn_agent" }] },
      ],
    },
    message("developer", "You are Codex."),
    message(
      "developer",
      "<skills_instructions>\n## Skills",
      "<permissions instructions>\nsandbox",
      "<tools>\n- mcp__x",
    ),
    message("user", "# AGENTS.md instructions\n日本語で", "<environment_context>\n</environment_context>"),
    message("user", "list the books"),
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "やります" }] },
    call("c1", "const ts = ALL_TOOLS.filter(t => /matomezu/.test(t.name)); text(ts)"),
    output("c1", "[...]"),
    call("c2", "text(await tools.mcp__matomezu__list_books({}));\ntext(await tools.mcp__matomezu__view({}))"),
    output("c2", "x".repeat(40)),
    call("c3", 'text(await tools.exec_command({cmd:"ls"}))'),
    output("c3", "a.txt"),
    ...extra,
  ],
})

test("exec の入力から道具の名前を取る: 最初の MCP の道具、無ければ最初の tools.<名前>、どちらも無ければ exec", () => {
  expect(execToolName("tools.exec_command({}); await tools.mcp__matomezu__read_page({})")).toBe(
    "mcp__matomezu__read_page",
  )
  expect(execToolName('text(await tools.exec_command({cmd:"ls"}))')).toBe("exec_command")
  expect(execToolName("ALL_TOOLS.filter(t => /mcp__matomezu__/.test(t.name))")).toBe("exec")
  expect(codex.toolUses(call("c", "tools.mcp__matomezu__join({})"))).toEqual([
    { id: "c", name: "mcp__matomezu__join", input: "tools.mcp__matomezu__join({})" },
  ])
  expect(codex.toolResults(output("c", "r"))).toEqual([
    { id: "c", chars: JSON.stringify(output("c", "r").output).length },
  ])
})

test("結果を呼んだ道具の名前で数え、matomezu の分を分け、cache_control の印は持たない", () => {
  const s = summarize(body())
  expect(s.results.map(r => r.tool)).toEqual(["exec", "mcp__matomezu__list_books", "exec_command"])
  expect(s.matomezuResultChars).toBe(JSON.stringify(output("c2", "x".repeat(40)).output).length)
  expect(s.toolsN).toBe(2)
  expect(s.messages).toBe(12)
  expect(s.marks).toBeUndefined()
})

test("前置きは input の項目の順で、最初に食い違った項目を出す", () => {
  const a = summarize(body()).prefix
  expect(divergeAt(a, summarize(body([message("user", "next")])).prefix)).toBe("none")
  const changed = body()
  changed.input[4] = message("user", "other")
  expect(divergeAt(a, summarize(changed).prefix)).toBe("input4")
})

test("中身は場所と確かめた見出しで分け、matomezu の結果は matomezu、知らない項目は不明にする", () => {
  const parts = classify(body([{ type: "reasoning", summary: [] }]))
  expect(parts.map(p => [p.where, p.label, p.group])).toEqual([
    ["input0.tools[0]", "道具の名前空間 functions", "固定"],
    ["input0.tools[1]", "道具の名前空間 collaboration", "固定"],
    ["input1[0]", "Codex の指示", "固定"],
    ["input2[0]", "スキルの一覧", "スキル"],
    ["input2[1]", "permissions instructions", "固定"],
    ["input2[2]", "遅延の道具の名前空間の一覧", "他の MCP"],
    ["input3[0]", "AGENTS.md の指示", "指示・メモリ"],
    ["input3[1]", "environment_context", "固定"],
    ["input4[0]", "利用者の入力", "会話"],
    ["input5[0]", "返答", "会話"],
    ["input6", "呼び出し exec", "会話"],
    ["input7", "結果 exec", "会話"],
    ["input8", "呼び出し mcp__matomezu__list_books", "matomezu"],
    ["input9", "結果 mcp__matomezu__list_books", "matomezu"],
    ["input10", "呼び出し exec_command", "会話"],
    ["input11", "結果 exec_command", "会話"],
    ["input12", "reasoning", "不明"],
  ])
  expect(parts.find(p => p.where === "input9")?.text).toBe(`Script completed\nOutput:\n${"x".repeat(40)}`)
})

test("道具の名前空間に matomezu の道具があれば matomezu、ほかの MCP は他の MCP にする", () => {
  const parts = classify({
    input: [
      {
        type: "additional_tools",
        tools: [
          { type: "namespace", name: "mcp__matomezu", tools: [{ name: "list_books" }] },
          { type: "namespace", name: "mcp__notion", tools: [{ name: "fetch" }] },
        ],
      },
    ],
  })
  expect(parts.map(p => p.group)).toEqual(["matomezu", "他の MCP"])
})

test("SSE の usage を response.completed から、行の途中で切れたチャンクからも拾い、キャッシュの分を input から引く", () => {
  const sse =
    'event: response.created\ndata: {"type":"response.created","response":{"usage":null}}\n\n' +
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"delta":"hi"}\n\n' +
    'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":1000,"input_tokens_details":{"cached_tokens":900,"cache_write_tokens":0},"output_tokens":7,"output_tokens_details":{"reasoning_tokens":2}}}}\n\n'
  const r = new UsageReader(codex)
  for (let i = 0; i < sse.length; i += 13) r.feed(sse.slice(i, i + 13))
  r.end()
  expect(r.usage).toEqual({
    input_tokens: 1000,
    "input_tokens_details.cached_tokens": 900,
    "input_tokens_details.cache_write_tokens": 0,
    output_tokens: 7,
    "output_tokens_details.reasoning_tokens": 2,
  })
  expect(tokens(r.usage)).toEqual({ input: 100, cacheRead: 900, cacheNew: 0, output: 7 })
  // 中断して response.completed が来なければ、値は無い
  expect(tokens({})).toEqual({ input: undefined, cacheRead: undefined, cacheNew: undefined, output: undefined })
})

test("返答は output_item.done の項目から組み、done の前に切れた項目は added と delta から組む", () => {
  const ev = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`
  const msg = { type: "message", role: "assistant", content: [{ type: "output_text", text: "検索します" }] }
  const sse =
    ev({ type: "response.output_item.added", output_index: 0, item: { ...msg, content: [] } }) +
    ev({ type: "response.output_text.delta", output_index: 0, delta: "検索" }) +
    ev({ type: "response.output_item.done", output_index: 0, item: msg }) +
    ev({ type: "response.output_item.added", output_index: 1, item: { type: "custom_tool_call", name: "exec" } }) +
    ev({ type: "response.custom_tool_call_input.delta", output_index: 1, delta: "text(await tools." }) +
    ev({ type: "response.custom_tool_call_input.delta", output_index: 1, delta: "mcp__matomezu__view({}))" })
  expect(parseReply(sse)).toEqual([
    { type: "text", text: "検索します" },
    { type: "tool_use", name: "exec", input: "text(await tools.mcp__matomezu__view({}))" },
  ])
  expect(parseReply(JSON.stringify({ output: [msg, { type: "reasoning" }] }))).toEqual([
    { type: "text", text: "検索します" },
    { type: "unknown", text: JSON.stringify({ type: "reasoning" }, null, 1) },
  ])
  expect(parseReply("{broken")).toEqual([])
})

test("ワークルーム名は user と developer の message の文から拾い、道具の結果に入る join の答えは見ない", () => {
  const joined = (name: string) => `You joined matomezu. Workroom name: ${name}`
  expect(workroomNameOf({ input: [message("developer", joined("dev_work"))] })).toBe("dev_work")
  expect(workroomNameOf({ input: [message("user", joined("old")), message("user", joined("new"))] })).toBe("new")
  expect(workroomNameOf({ input: [output("c", joined("fake"))] })).toBeUndefined()
})

test("セッション id は session-id のヘッダー、流れは thread-id から取る", () => {
  const h = (thread: string) => new Headers({ "session-id": "s1", "thread-id": thread })
  expect(codex.sessionIdOf({}, h("t1"))).toBe("s1")
  const s = summarize(body())
  expect(codex.streamOf({}, h("t1"), s)).toBe(codex.streamOf({}, h("t1"), s))
  expect(codex.streamOf({}, h("t1"), s)).not.toBe(codex.streamOf({}, h("t2"), s))
})
