// Claude Code の部品。Anthropic の Messages API（POST /v1/messages）の本文を読む
import { chars, firstDiff, hash, resultsOf } from "../common"
import { isMatomezuSend, isMatomezuTool, MATOMEZU_SERVERS, matomezuReceipts } from "../matomezu"
import {
  type Client,
  type Entry,
  type Group,
  type ItemFacts,
  MAIN_THREAD,
  type Part,
  type ReplyBlock,
  type Summary,
  type ToolResult,
  type ToolUse,
  UNNAMED_AGENT_THREAD,
  type Usage,
} from "../types"

export type Block = { type: string; [key: string]: unknown }
export type Message = { role: string; content: string | Block[] }
export type MessagesBody = {
  model?: string
  system?: unknown
  tools?: { name: string; defer_loading?: boolean }[]
  messages?: Message[]
  metadata?: { user_id?: string }
  max_tokens?: number
}

const blocksOf = (m: Message): Block[] =>
  typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content

function toolUses(item: unknown): ToolUse[] {
  const m = item as Message | null
  if (!m || !Array.isArray(m.content)) return []
  return m.content
    .filter(b => b.type === "tool_use")
    .map(b => ({ id: b.id as string, name: b.name as string, input: b.input }))
}

function toolResults(item: unknown): ToolResult[] {
  const m = item as Message | null
  if (!m || !Array.isArray(m.content)) return []
  return m.content
    .filter(b => b.type === "tool_result")
    .map(b => ({ id: b.tool_use_id as string, chars: chars(b.content) }))
}

export function summarize(body: MessagesBody): Summary {
  const messages = body.messages ?? []
  const tools = body.tools ?? []
  const results = resultsOf(claude, messages)
  let textChars = 0
  for (const m of messages) {
    if (typeof m.content === "string") {
      textChars += m.content.length
      continue
    }
    for (const b of m.content) if (b.type === "text") textChars += (b.text as string).length
  }
  const marks: string[] = []
  const scan = (where: string, list: unknown) => {
    if (!Array.isArray(list)) return
    list.forEach((b, i) => {
      const mark = (b as { cache_control?: { ttl?: string } } | null)?.cache_control
      if (mark) marks.push(`${where}[${i}]:${mark.ttl ?? "5m"}`)
    })
  }
  scan("tools", tools)
  scan("system", body.system)
  messages.forEach((m, i) => {
    scan(`msg${i}`, m.content)
  })
  // キャッシュで同じに扱われる物は同じに積む。cache_control の印は毎回最後のメッセージへ動き、印を付けるときに文字列の本文は
  // text のブロック 1 つに書き換わる。defer_loading のツールは前置きに入らない
  const prefix = [hash(withoutMarks(tools.filter(t => !t.defer_loading)))]
  const push = (...values: unknown[]) => prefix.push(hash(prefix.at(-1), ...values))
  push(asBlocks(withoutMarks(body.system)))
  for (const m of messages) push(m.role, asBlocks(withoutMarks(m.content)))
  const matomezuTools = tools.filter(t => isMatomezuTool(t.name))
  return {
    model: body.model ?? "?",
    messages: messages.length,
    systemHash: hash(body.system),
    toolsHash: hash(tools),
    systemChars: chars(body.system),
    toolsN: tools.length,
    toolsChars: chars(tools),
    matomezuToolsN: matomezuTools.length,
    matomezuToolsChars: chars(matomezuTools),
    textChars,
    resultChars: results.reduce((n, r) => n + r.chars, 0),
    matomezuResultChars: results.filter(r => isMatomezuTool(r.tool)).reduce((n, r) => n + r.chars, 0),
    marks,
    prefix,
    results,
  }
}

function withoutMarks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMarks)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== "cache_control")
      .map(([k, v]) => [k, withoutMarks(v)]),
  )
}

function asBlocks(content: unknown): unknown {
  return typeof content === "string" ? [{ type: "text", text: content }] : content
}

// 前置きの並びは [tools, +system, +msg0, +msg1, …]
export function divergeAt(prev: string[] | undefined, cur: string[]): string {
  const i = firstDiff(prev, cur)
  return i === "none" ? i : i === 0 ? "tools" : i === 1 ? "system" : `msg${i - 2}`
}

export function sessionIdOf(body: MessagesBody): string {
  try {
    return JSON.parse(body.metadata?.user_id ?? "{}").session_id ?? ""
  } catch {
    return ""
  }
}

// フックの文として入る行だけを見る（join し直して名前が変われば、新しい名前になる）
export function workroomNameOf(body: MessagesBody): string | undefined {
  let name: string | undefined
  for (const m of body.messages ?? []) {
    if (typeof m.content === "string") continue
    for (const b of m.content) {
      if (
        b.type !== "text" ||
        typeof b.text !== "string" ||
        !b.text.startsWith("UserPromptSubmit hook additional context:")
      )
        continue
      name = b.text.match(/Workroom name: (.+)$/m)?.[1]?.trim() ?? name
    }
  }
  return name
}

// Claude Code が起動のときに残りの枠を確かめるリクエスト: max_tokens が 1 で、本文が "quota" の 1 通だけ
export function probeOf(body: MessagesBody): Entry["probe"] {
  const only = body.messages?.length === 1 ? body.messages[0] : undefined
  const text = typeof only?.content === "string" ? only.content : undefined
  return body.max_tokens === 1 && text === "quota" ? "quota" : undefined
}

// Anthropic の input_tokens はキャッシュの分を含まない
export function tokens(u: Usage) {
  return {
    input: u.input_tokens,
    cacheRead: u.cache_read_input_tokens,
    cacheNew: u.cache_creation_input_tokens,
    output: u.output_tokens,
  }
}

// ---- スレッドと事実 ----

// サブエージェントのリクエストには、その子の id（Agent の結果の agentId と同じ）がヘッダーに付く。親には付かない。
// 値を残していない記録（名前だけの <dropped>）は、子だとは分かるが、どの子かは分からない
export function threadOf(headers: Headers): string {
  const id = headers.get("x-claude-code-agent-id")
  if (!id) return MAIN_THREAD
  return id === "<dropped>" ? UNNAMED_AGENT_THREAD : id
}

// 届く文は、ブロックの頭（cross-session-message・agent-message は「Another Claude session sent a message:」の行のあと）か、
// 行の頭（task-notification・matomezu の知らせ）にある物だけを見る。道具の結果や返答の中の引用は拾わない
const CROSS_SESSION =
  /^(?:Another Claude session sent a message:\n)?<cross-session-message from="[^"]*" from-name="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/cross-session-message>/
const AGENT_MESSAGE = /^(?:Another Claude session sent a message:\n)?<agent-message from="([\w-]+)">/
const TASK_NOTIFICATION = /^<task-notification>\n<task-id>([\w-]+)<\/task-id>/gm
// Agent の結果の、子の id の行。非同期は「Async agent launched successfully.」で始まり、子はまだ動いている
const AGENT_ID = /^agentId: ([\w-]+) \(/m

const textOf = (content: unknown) =>
  Array.isArray(content)
    ? content.map(b => (typeof b?.text === "string" ? b.text : "")).join("\n")
    : typeof content === "string"
      ? content
      : ""

export function factsOf(item: unknown): ItemFacts {
  const facts: ItemFacts = { spawns: [], started: [], returns: [], sends: [], receipts: [] }
  const m = item as Message | null
  if (!m || (typeof m.content !== "string" && !Array.isArray(m.content))) return facts
  for (const b of blocksOf(m)) {
    if (m.role === "assistant" && b.type === "tool_use") {
      const input = (b.input ?? {}) as Record<string, unknown>
      const name = b.name as string
      if (name === "Agent")
        facts.spawns.push({
          callId: b.id as string,
          agentType: String(input.subagent_type ?? "general-purpose"),
          description: String(input.description ?? ""),
        })
      else if (name === "SendMessage" && typeof input.to === "string" && typeof input.message === "string")
        facts.sends.push({ callId: b.id as string, via: "SendMessage", to: input.to, text: input.message })
      else if (isMatomezuSend(name) && typeof input.to === "string" && typeof input.text === "string")
        facts.sends.push({ callId: b.id as string, via: "send_message", to: input.to, text: input.text })
    } else if (m.role === "user" && b.type === "tool_result") {
      const text = textOf(b.content)
      const agentId = text.match(AGENT_ID)?.[1]
      if (!agentId) continue
      facts.started.push({ callId: b.tool_use_id as string, agentId })
      if (!text.startsWith("Async agent launched")) facts.returns.push({ agentId, how: "result" })
    } else if (m.role !== "assistant" && b.type === "text" && typeof b.text === "string") {
      const text = b.text
      const cross = text.match(CROSS_SESSION)
      if (cross) facts.receipts.push({ via: "SendMessage", from: cross[1] ?? "", text: cross[2] ?? "" })
      const handback = text.match(AGENT_MESSAGE)?.[1]
      if (handback) facts.returns.push({ agentId: handback, how: "handback" })
      for (const n of text.matchAll(TASK_NOTIFICATION)) facts.returns.push({ agentId: n[1] ?? "", how: "notification" })
      for (const r of matomezuReceipts(text)) facts.receipts.push({ via: "send_message", ...r })
    }
  }
  return facts
}

// ---- 中身の分け方 ----
// 場所（system・tools・メッセージの役割と種類）、ツール名の前置き、Claude Code が本文に入れる決まった見出しだけで決める

const norm = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase()

const serverOf = (tool: string) => tool.match(/^mcp__(.+?)__/)?.[1]

function toolGroup(name: string): Group {
  if (isMatomezuTool(name)) return "matomezu"
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
  {
    re: /^The following deferred tools are no longer available/,
    make: () => ({ label: "外れた遅延ツールの名前", group: "他の MCP" }),
  },
  { re: /^The following MCP servers have disconnected/, make: () => ({ label: "切れた MCP", group: "他の MCP" }) },
  { re: /^# MCP Server Instructions/, make: () => ({ label: "MCP の説明の前置き", group: "他の MCP" }) },
  {
    re: /^Available agent types for the Agent tool:/,
    make: () => ({ label: "エージェントの種類の一覧", group: "固定" }),
  },
  { re: /^Note: \S+ changed on disk/, make: () => ({ label: "ファイルが変わった知らせ", group: "固定" }) },
  { re: /^While auto mode is active:/, make: () => ({ label: "auto モードの指示", group: "固定" }) },
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
        group: MATOMEZU_SERVERS.has(norm(name)) ? "matomezu" : "他の MCP",
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

export function classify(body: MessagesBody): Part[] {
  const parts: Part[] = []
  const tools = body.tools ?? []
  const messages = body.messages ?? []

  const servers = new Set<string>()
  const note = (name: string) => {
    const s = serverOf(name)
    if (s) servers.add(norm(s))
  }
  for (const t of tools) note(t.name)
  // 遅延ツールは名前だけが本文の一覧に並ぶので、本文の行の頭の mcp__<サーバー>__ からも拾う
  for (const m of messages) {
    for (const b of blocksOf(m)) {
      const name = (b as { tool?: { definition?: { name?: string } } }).tool?.definition?.name
      if (b.type === "tool_addition" && name) note(name)
      if (b.type === "text") for (const line of (b.text as string).match(/^mcp__\S+/gm) ?? []) note(line)
    }
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

  const names = new Map(messages.flatMap(toolUses).map(u => [u.id, u.name]))

  messages.forEach((m, i) => {
    blocksOf(m).forEach((b, j) => {
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
          group: isMatomezuTool(name) ? "matomezu" : "会話",
          chars: JSON.stringify(b).length,
          text,
        })
      } else if (b.type === "tool_result") {
        const name = names.get(b.tool_use_id as string) ?? "?"
        parts.push({
          where,
          label: `結果 ${name}`,
          group: isMatomezuTool(name) ? "matomezu" : "会話",
          chars: chars(b.content),
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

// ---- 返答 ----
// 記録した返答（SSE か JSON の本文）から、モデルが返した中身をブロックに組み直す

type Partial = { type: string; name?: string; text: string }

export function parseReply(raw: string): ReplyBlock[] {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith("{")) return fromJson(trimmed)
  const parts = new Map<number, Partial>()
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue
    let event: {
      type?: string
      index?: number
      content_block?: Record<string, unknown>
      delta?: Record<string, unknown>
    }
    try {
      event = JSON.parse(line.slice(5))
    } catch {
      continue
    }
    if (event.index === undefined) continue
    if (event.type === "content_block_start" && event.content_block) {
      const b = event.content_block
      parts.set(event.index, { type: String(b.type), name: b.name as string | undefined, text: "" })
    } else if (event.type === "content_block_delta" && event.delta) {
      const p = parts.get(event.index)
      if (!p) continue
      const d = event.delta
      p.text += String(d.text ?? d.partial_json ?? d.thinking ?? "")
    }
  }
  return [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => toBlock(p))
}

function toBlock(p: Partial): ReplyBlock {
  if (p.type === "tool_use") return { type: "tool_use", name: p.name ?? "?", input: p.text }
  if (p.type === "thinking") return { type: "thinking", text: p.text }
  return { type: "text", text: p.text }
}

function fromJson(text: string): ReplyBlock[] {
  try {
    const content = JSON.parse(text).content
    if (!Array.isArray(content)) return []
    return content.map((b: Record<string, unknown>) =>
      toBlock({
        type: String(b.type),
        name: b.name as string | undefined,
        text: b.type === "tool_use" ? JSON.stringify(b.input) : String(b.text ?? b.thinking ?? ""),
      }),
    )
  } catch {
    return []
  }
}

export const claude: Client<MessagesBody> = {
  name: "claude",
  head: "",
  upstream: "https://api.anthropic.com",
  keepHeaders: new Set([
    "content-type",
    "accept",
    "user-agent",
    "x-app",
    "anthropic-version",
    "anthropic-beta",
    "x-claude-code-agent-id",
  ]),
  recorded: (method, path) => method === "POST" && path === "/v1/messages",
  sessionIdOf,
  // 同じセッションの中の、モデルと system の組（サブエージェントや要約の呼び出しは別の流れになる）
  streamOf: (_body, _headers, summary) => hash(summary.model, summary.systemHash).slice(0, 4),
  threadOf,
  workroomNameOf,
  summarize,
  divergeAt,
  classify,
  // 入力の側は message_start、出力は message_delta に来る
  usageOfEvent: event =>
    event.type === "message_start"
      ? (event.message as { usage?: unknown } | undefined)?.usage
      : event.type === "message_delta"
        ? event.usage
        : undefined,
  endEvent: "message_stop",
  tokens,
  parseReply,
  toolUses,
  toolResults,
  factsOf,
  // system と tools は毎回ほぼ同じ、messages は伸びていく
  split: ({ system, tools, messages, ...rest }) => ({
    rest,
    fixed: { ...(system === undefined ? {} : { system }), ...(tools === undefined ? {} : { tools }) },
    list: { name: "messages", items: messages ?? [] },
  }),
  probeOf,
}
