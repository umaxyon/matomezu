// リクエストの中身を、場所と由来（誰が直せるか）で分ける。AI の判断は使わず、場所（system・tools・メッセージの役割と種類）、
// ツール名の前置き、Claude Code が本文に入れる決まった見出しだけで決める。当てはまらない物は「不明」にして、隠さない
import type { Body } from "../relay-log"

export type Group = "matomezu" | "指示・メモリ" | "スキル" | "他の MCP" | "フック" | "会話" | "固定" | "不明"
// 利用者や開発者が直せない（Claude Code が毎回入れる）物と、会話そのもの。トグルで隠す
export const HIDDEN_BY_DEFAULT: Group[] = ["固定", "会話"]

export type Part = { where: string; label: string; group: Group; chars: number; text: string }

const MATOMEZU = "mcp__matomezu__"
const norm = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase()

const serverOf = (tool: string) => tool.match(/^mcp__(.+?)__/)?.[1]

function toolGroup(name: string): Group {
  if (name.startsWith(MATOMEZU)) return "matomezu"
  return name.startsWith("mcp__") ? "他の MCP" : "固定"
}

// 本文に入る決まった行。この行から次の行までが 1 つの節
type Marker = { re: RegExp; make: (m: RegExpMatchArray) => { label: string; group: Group } }
const MARKERS: Marker[] = [
  { re: /^Codebase and user instructions are shown below/, make: () => ({ label: "前置き", group: "固定" }) },
  { re: /^As you answer the user's questions/, make: () => ({ label: "前置き", group: "固定" }) },
  { re: /^Attribution for git commits/, make: () => ({ label: "コミットの署名の指示", group: "固定" }) },
  {
    re: /^Contents of (\S+) \(/,
    make: m => {
      const path = m[1] ?? ""
      return { label: `${/MEMORY\.md$/.test(path) ? "メモリ" : "指示"} ${shortPath(path)}`, group: "指示・メモリ" }
    },
  },
  { re: /^# userEmail/, make: () => ({ label: "userEmail", group: "固定" }) },
  { re: /^# gitStatus/, make: () => ({ label: "gitStatus", group: "固定" }) },
  { re: /^# Environment/, make: () => ({ label: "Environment", group: "固定" }) },
  { re: /^The following tools just became available/, make: () => ({ label: "追加されたツール", group: "他の MCP" }) },
  {
    re: /^The following deferred tools are now available/,
    make: () => ({ label: "遅延ツールの名前の一覧", group: "他の MCP" }),
  },
  { re: /^# MCP Server Instructions/, make: () => ({ label: "MCP の説明の前置き", group: "他の MCP" }) },
  { re: /^The following skills are available/, make: () => ({ label: "スキルの一覧", group: "スキル" }) },
  { re: /^Today's date is/, make: () => ({ label: "今日の日付", group: "固定" }) },
  { re: /^# Advisor Tool/, make: () => ({ label: "Advisor Tool", group: "固定" }) },
  { re: /^(\w+) hook additional context:/, make: m => ({ label: `${m[1]} フック`, group: "フック" }) },
]

const shortPath = (p: string) => p.split("/").slice(-2).join("/")

export function splitSections(
  text: string,
  first: { label: string; group: Group },
  servers: Set<string>,
): Omit<Part, "where">[] {
  const out: { label: string; group: Group; lines: string[] }[] = [{ ...first, lines: [] }]
  let inMcp = false
  for (const line of text.split("\n")) {
    const marker = MARKERS.map(k => ({ k, m: line.match(k.re) })).find(x => x.m)
    if (marker?.m) {
      inMcp = /^# MCP Server Instructions/.test(line)
      out.push({ ...marker.k.make(marker.m), lines: [line] })
      continue
    }
    // MCP の説明の中の「## サーバー名」。名前がツールの前置きにあるサーバーだけを節の切れ目にする
    const name = inMcp ? line.match(/^## (.+)$/)?.[1] : undefined
    if (name && servers.has(norm(name))) {
      out.push({
        label: `MCP の説明 ${name}`,
        group: norm(name) === "matomezu" ? "matomezu" : "他の MCP",
        lines: [line],
      })
      continue
    }
    out.at(-1)?.lines.push(line)
  }
  return out
    .map(s => ({ label: s.label, group: s.group, text: s.lines.join("\n") }))
    .filter(s => s.text.replace(/<\/?system-reminder>/g, "").trim() !== "")
    .map(s => ({ ...s, chars: s.text.length }))
}

function blockDefault(role: string, text: string): { label: string; group: Group } {
  if (role === "user" && !text.startsWith("<system-reminder>")) return { label: "利用者の入力", group: "会話" }
  if (role === "assistant") return { label: "返答", group: "会話" }
  return { label: text.replace(/\s+/g, " ").slice(0, 40), group: "不明" }
}

const asText = (c: unknown) => (typeof c === "string" ? c : JSON.stringify(c, null, 1))

export function classify(body: Body): Part[] {
  const parts: Part[] = []
  const tools = (body.tools ?? []) as { name: string; defer_loading?: boolean }[]
  const messages = body.messages ?? []

  const servers = new Set<string>()
  const note = (name: string) => {
    const s = serverOf(name)
    if (s) servers.add(norm(s))
  }
  for (const t of tools) note(t.name)
  for (const m of messages)
    if (Array.isArray(m.content))
      for (const b of m.content) {
        const name = (b as { tool?: { definition?: { name?: string } } }).tool?.definition?.name
        if (b.type === "tool_addition" && name) note(name)
      }

  const system = Array.isArray(body.system) ? body.system : body.system ? [{ text: body.system }] : []
  system.forEach((b, i) => {
    const text = (b as { text?: string }).text ?? asText(b)
    parts.push({ where: `system[${i}]`, label: "system", group: "固定", chars: text.length, text })
  })
  for (const t of tools) {
    const text = JSON.stringify(t, null, 1)
    parts.push({
      where: "tools",
      label: `${t.name}${t.defer_loading ? "（遅延）" : ""}`,
      group: t.name === "DeferredToolPlaceholder" ? "固定" : toolGroup(t.name),
      chars: JSON.stringify(t).length,
      text,
    })
  }

  const toolNames = new Map<string, string>()
  for (const m of messages)
    if (Array.isArray(m.content))
      for (const b of m.content) if (b.type === "tool_use") toolNames.set(b.id as string, b.name as string)

  messages.forEach((m, i) => {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content
    blocks.forEach((b, j) => {
      const where = `msg${i}[${j}]`
      if (b.type === "text") {
        const text = b.text as string
        for (const s of splitSections(text, blockDefault(m.role, text), servers)) parts.push({ where, ...s })
      } else if (b.type === "tool_use") {
        const name = b.name as string
        const text = JSON.stringify(b.input, null, 1)
        parts.push({
          where,
          label: `呼び出し ${name}`,
          group: name.startsWith(MATOMEZU) ? "matomezu" : "会話",
          chars: JSON.stringify(b).length,
          text,
        })
      } else if (b.type === "tool_result") {
        const name = toolNames.get(b.tool_use_id as string) ?? "?"
        parts.push({
          where,
          label: `結果 ${name}`,
          group: name.startsWith(MATOMEZU) ? "matomezu" : "会話",
          chars: JSON.stringify(b.content ?? "").length,
          text: asText(b.content),
        })
      } else if (b.type === "tool_addition") {
        const name = (b as { tool?: { definition?: { name?: string } } }).tool?.definition?.name ?? "?"
        const text = JSON.stringify(b, null, 1)
        parts.push({ where, label: `追加 ${name}`, group: toolGroup(name), chars: JSON.stringify(b).length, text })
      } else {
        const text = JSON.stringify(b, null, 1)
        parts.push({
          where,
          label: b.type,
          group: b.type === "thinking" ? "会話" : "不明",
          chars: JSON.stringify(b).length,
          text,
        })
      }
    })
  })
  return parts
}

export function totals(parts: Part[]): { group: Group; chars: number }[] {
  const by = new Map<Group, number>()
  for (const p of parts) by.set(p.group, (by.get(p.group) ?? 0) + p.chars)
  return [...by].map(([group, chars]) => ({ group, chars })).sort((a, b) => b.chars - a.chars)
}
