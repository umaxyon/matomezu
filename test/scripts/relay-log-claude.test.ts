import { expect, test } from "bun:test"
import {
  type Block,
  classify,
  claude,
  divergeAt,
  type MessagesBody,
  parseReply,
  sessionIdOf,
  splitSections,
  summarize,
  tokens,
  workroomNameOf,
} from "../../scripts/relay-log/clients/claude"
import { totals, UsageReader } from "../../scripts/relay-log/common"

const groupOf = (parts: ReturnType<typeof classify>, label: string) => parts.find(p => p.label.includes(label))?.group

test("ツールは名前の前置きで、matomezu・他の MCP・固定に分かれる", () => {
  const parts = classify({
    tools: [
      { name: "Bash" },
      { name: "mcp__matomezu__search" },
      { name: "mcp__claude_ai_Notion__fetch", defer_loading: true },
    ],
    messages: [],
  })
  expect(groupOf(parts, "Bash")).toBe("固定")
  expect(groupOf(parts, "matomezu__search")).toBe("matomezu")
  expect(groupOf(parts, "Notion")).toBe("他の MCP")
})

test("system-reminder の中は、決まった行で節に分け、指示・メモリ・スキルを直せる所にする", () => {
  const text = [
    "<system-reminder>",
    "Contents of /w/CLAUDE.md (project instructions):",
    "# 本文の見出し",
    "Contents of /m/3_x/MEMORY.md (auto-memory):",
    "- メモ",
    "# gitStatus",
    "main",
    "</system-reminder>",
  ].join("\n")
  const parts = classify({ messages: [{ role: "user", content: [{ type: "text", text }] }] })
  expect(parts.map(p => [p.label, p.group])).toEqual([
    ["指示 w/CLAUDE.md", "指示・メモリ"],
    ["メモリ 3_x/MEMORY.md", "指示・メモリ"],
    ["gitStatus", "固定"],
  ])
})

test("MCP の説明は、ツールの前置きにあるサーバー名の見出しだけで切る", () => {
  const text = [
    "# MCP Server Instructions",
    "## claude.ai Zapier",
    "ほか",
    "## Managing what's enabled",
    "Zapier の説明の中の見出し",
    "## matomezu",
    "matomezu の説明",
  ].join("\n")
  const sections = splitSections(text, { label: "x", group: "不明" }, new Set(["claude_ai_zapier", "matomezu"]))
  expect(sections.map(s => [s.label, s.group])).toEqual([
    ["MCP の説明の前置き", "他の MCP"],
    ["MCP の説明 claude.ai Zapier", "他の MCP"],
    ["MCP の説明 matomezu", "matomezu"],
  ])
})

test("ツールの結果は呼んだツールで分け、当てはまらない物は不明にする", () => {
  const parts = classify({
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "a", name: "mcp__matomezu__search", input: {} },
          { type: "tool_use", id: "b", name: "Read", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: "x" },
          { type: "tool_result", tool_use_id: "b", content: "y" },
        ],
      },
      { role: "system", content: [{ type: "text", text: "知らない文" }] },
    ],
  })
  expect(groupOf(parts, "結果 mcp__matomezu__search")).toBe("matomezu")
  expect(groupOf(parts, "結果 Read")).toBe("会話")
  expect(parts.at(-1)?.group).toBe("不明")
  expect(totals(parts).reduce((n, t) => n + t.chars, 0)).toBe(parts.reduce((n, p) => n + p.chars, 0))
})

test("遅延ツールの名前の一覧のサーバーで MCP の説明を切り、エージェントの種類の一覧は固定の節にする", () => {
  const text = [
    "The following deferred tools are now available via ToolSearch.",
    "mcp__claude_ai_Notion__notion-fetch",
    "Available agent types for the Agent tool:",
    "- claude: Catch-all",
    "Note: /w/a.md changed on disk since you last read it.",
    "# MCP Server Instructions",
    "## claude.ai Notion",
    "Notion の説明",
  ].join("\n")
  const parts = classify({ messages: [{ role: "user", content: [{ type: "text", text }] }] })
  expect(parts.map(p => [p.label, p.group])).toEqual([
    ["遅延ツールの名前の一覧", "他の MCP"],
    ["エージェントの種類の一覧", "固定"],
    ["ファイルが変わった知らせ", "固定"],
    ["MCP の説明の前置き", "他の MCP"],
    ["MCP の説明 claude.ai Notion", "他の MCP"],
  ])
})

test("プラグインから入れた matomezu の道具（mcp__plugin_matomezu_matomezu__）も matomezu に分ける", () => {
  const parts = classify({
    tools: [{ name: "mcp__plugin_matomezu_matomezu__search" }],
    messages: [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "a", name: "mcp__plugin_matomezu_matomezu__search", input: {} }],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "x" }] },
      {
        role: "user",
        content: [{ type: "text", text: "# MCP Server Instructions\n## plugin:matomezu:matomezu\nmatomezu の説明" }],
      },
    ],
  })
  expect(parts.filter(p => p.group === "matomezu").map(p => p.label)).toEqual([
    "mcp__plugin_matomezu_matomezu__search",
    "呼び出し mcp__plugin_matomezu_matomezu__search",
    "結果 mcp__plugin_matomezu_matomezu__search",
    "MCP の説明 plugin:matomezu:matomezu",
  ])
})

test("SSE の返答を、テキストと tool_use のブロックに組み直す", () => {
  const ev = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`
  const sse =
    ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
    ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "検索" } }) +
    ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "します" } }) +
    ev({ type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "mcp__matomezu__search" } }) +
    ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"q":' } }) +
    ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"a"}' } })
  expect(parseReply(sse)).toEqual([
    { type: "text", text: "検索します" },
    { type: "tool_use", name: "mcp__matomezu__search", input: '{"q":"a"}' },
  ])
})

test("JSON の返答も読み、壊れた本文は空にする", () => {
  const body = JSON.stringify({
    content: [
      { type: "text", text: "hi" },
      { type: "tool_use", name: "t", input: { a: 1 } },
    ],
  })
  expect(parseReply(body)).toEqual([
    { type: "text", text: "hi" },
    { type: "tool_use", name: "t", input: '{"a":1}' },
  ])
  expect(parseReply("{broken")).toEqual([])
})

test("SSE の usage を、行の途中で切れたチャンクからも拾い、キャッシュの外の入力はそのまま input にする", () => {
  const sse =
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":3,"cache_read_input_tokens":100,"cache_creation_input_tokens":20,"cache_creation":{"ephemeral_1h_input_tokens":20}}}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n' +
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n'
  const r = new UsageReader(claude)
  for (let i = 0; i < sse.length; i += 13) r.feed(sse.slice(i, i + 13))
  r.end()
  expect(r.usage).toEqual({
    input_tokens: 3,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 20,
    "cache_creation.ephemeral_1h_input_tokens": 20,
    output_tokens: 7,
  })
  expect(tokens(r.usage)).toEqual({ input: 3, cacheRead: 100, cacheNew: 20, output: 7 })
})

const body = (
  extra: MessagesBody["messages"] = [],
): MessagesBody & { messages: NonNullable<MessagesBody["messages"]> } => ({
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

test("join のあとのフックの文から、最後のワークルーム名を拾う", () => {
  const hook = (name: string) => ({
    type: "text",
    text: `UserPromptSubmit hook additional context: You joined matomezu. Workroom name: ${name}`,
  })
  const msgs = (...blocks: Block[]) => ({ messages: [{ role: "system", content: blocks }] })
  expect(workroomNameOf(msgs(hook("debug_work")))).toBe("debug_work")
  expect(workroomNameOf(msgs(hook("old"), hook("new")))).toBe("new")
  // フックの文でない本文に同じ言い回しがあっても拾わない
  expect(workroomNameOf(msgs({ type: "text", text: "Workroom name: fake" }))).toBeUndefined()
  expect(workroomNameOf({ messages: [{ role: "user", content: "x" }] })).toBeUndefined()
  // 会話の途中の system の message（文字列）に、ほかの知らせと並んで入るフックの文も拾う
  const notice =
    "[SYSTEM NOTIFICATION]\nevent\n\nUserPromptSubmit hook additional context: You joined matomezu. Workroom name: sub6_work\nThe user lets you"
  expect(workroomNameOf({ messages: [{ role: "system", content: notice }] })).toBe("sub6_work")
  expect(workroomNameOf({ messages: [{ role: "system", content: "Workroom name: fake" }] })).toBeUndefined()
})

test("セッション id は本文の metadata の user_id から取る", () => {
  expect(sessionIdOf({ metadata: { user_id: JSON.stringify({ session_id: "abc" }) } })).toBe("abc")
  expect(sessionIdOf({})).toBe("")
})
