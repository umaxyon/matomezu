import { expect, test } from "bun:test"
import { classify, splitSections, totals } from "../../scripts/relay-log/classify"

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
