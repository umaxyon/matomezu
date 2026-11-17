// Codex の部品。ChatGPT のログインのまま使う Responses API（POST /responses）の本文を読む。
// codex を、窓口の base_url を中継の /codex にした model_provider で起動すると、/codex を外した残りの道が上流へ渡る
import { chars, firstDiff, hash, resultsOf, sseEvents } from "../common"
import { isMatomezuNamespace, isMatomezuTool } from "../matomezu"
import {
  type Client,
  type Group,
  type ItemFacts,
  type ItemTokens,
  MAIN_THREAD,
  type Part,
  type ReplyBlock,
  type Summary,
  type ToolResult,
  type ToolUse,
  type Usage,
} from "../types"

export type ContentPart = { type: string; text?: string; [key: string]: unknown }
export type Tool = { type?: string; name?: string; tools?: Tool[]; [key: string]: unknown }
// input の項目。message・additional_tools・custom_tool_call・custom_tool_call_output・function_call など
export type Item = {
  type: string
  role?: string
  content?: ContentPart[] | string
  tools?: Tool[]
  name?: string
  call_id?: string
  input?: string
  arguments?: string
  output?: unknown
  [key: string]: unknown
}
// 毎回全文が送り直される（previous_response_id は使わない）。instructions と tools も使わず、道具の説明は input の頭に入る
export type ResponsesBody = { model?: string; input?: Item[]; [key: string]: unknown }

const textsOf = (item: Item): ContentPart[] =>
  typeof item.content === "string" ? [{ type: "input_text", text: item.content }] : (item.content ?? [])

const isMessage = (item: Item, role: string) => item.type === "message" && item.role === role

// exec は JavaScript の中から tools.<名前>(...) で道具を呼ぶ。名前は、その中の最初の MCP の道具（tools.mcp__…）、無ければ最初の
// tools.<名前>（シェルの exec_command など）、どちらも無ければ exec。1 つの exec で複数を呼んでも、結果はその exec の出力の全体を
// この 1 つの名前で数える
export function execToolName(input: string, fallback = "exec"): string {
  return input.match(/\btools\.(mcp__[A-Za-z0-9_]+)/)?.[1] ?? input.match(/\btools\.([A-Za-z_]\w*)/)?.[1] ?? fallback
}

function toolUses(value: unknown): ToolUse[] {
  const item = value as Item | null
  if (!item?.call_id) return []
  if (item.type === "custom_tool_call") {
    const input = item.input ?? ""
    return [{ id: item.call_id, name: execToolName(input, item.name ?? "?"), input }]
  }
  if (item.type === "function_call") return [{ id: item.call_id, name: item.name ?? "?", input: item.arguments }]
  return []
}

function toolResults(value: unknown): ToolResult[] {
  const item = value as Item | null
  if (!item?.call_id || (item.type !== "custom_tool_call_output" && item.type !== "function_call_output")) return []
  return [{ id: item.call_id, chars: chars(item.output) }]
}

// additional_tools の道具の名前空間を開いた、道具 1 つずつ
const flatTools = (items: Item[]): { ns?: string; tool: Tool }[] =>
  items
    .filter(i => i.type === "additional_tools")
    .flatMap(i => i.tools ?? [])
    .flatMap(t => (t.type === "namespace" ? (t.tools ?? []).map(tool => ({ ns: t.name, tool })) : [{ tool: t }]))

const isMatomezuOf = ({ ns, tool }: { ns?: string; tool: Tool }) =>
  (ns !== undefined && isMatomezuNamespace(ns)) || isMatomezuTool(tool.name ?? "")

export function summarize(body: ResponsesBody): Summary {
  const input = body.input ?? []
  const toolItems = input.filter(i => i.type === "additional_tools")
  const developer = leadingDeveloper(input)
  const tools = flatTools(input)
  const matomezuTools = tools.filter(isMatomezuOf)
  const results = resultsOf(codex, input)
  let textChars = 0
  for (const i of input)
    if (isMessage(i, "user") || isMessage(i, "assistant")) for (const p of textsOf(i)) textChars += p.text?.length ?? 0
  const prefix: string[] = []
  for (const i of input) prefix.push(hash(prefix.at(-1), i))
  return {
    model: body.model ?? "?",
    messages: input.length,
    systemHash: hash(developer),
    toolsHash: hash(toolItems),
    systemChars: chars(developer),
    toolsN: tools.length,
    toolsChars: chars(toolItems),
    matomezuToolsN: matomezuTools.length,
    matomezuToolsChars: chars(matomezuTools.map(t => t.tool)),
    textChars,
    resultChars: results.reduce((n, r) => n + r.chars, 0),
    matomezuResultChars: results.filter(r => isMatomezuTool(r.tool)).reduce((n, r) => n + r.chars, 0),
    prefix,
    results,
  }
}

// 先頭の developer の message（Codex の指示）。会話が始まったあとの developer の message はフックの文なので入れない
function leadingDeveloper(input: Item[]): Item[] {
  const out: Item[] = []
  for (const i of input) {
    if (i.type === "additional_tools") continue
    if (!isMessage(i, "developer")) break
    out.push(i)
  }
  return out
}

// 前置きの並びは input の項目の順
export function divergeAt(prev: string[] | undefined, cur: string[]): string {
  const i = firstDiff(prev, cur)
  return i === "none" ? i : `input${i}`
}

// join のあとに入る「Workroom name: <名前>」の最後の 1 つ。フックの文は user と developer のどちらの message の文からも探す
// （道具の結果に入る join の答えは見ない）
export function workroomNameOf(body: ResponsesBody): string | undefined {
  let name: string | undefined
  for (const i of body.input ?? []) {
    if (!isMessage(i, "user") && !isMessage(i, "developer")) continue
    for (const p of textsOf(i)) {
      for (const m of (p.text ?? "").matchAll(/Workroom name: (.+)$/gm)) name = m[1]?.trim() || name
    }
  }
  return name
}

// Responses API の input_tokens は、キャッシュから読んだ分（cached_tokens）と書いた分（cache_write_tokens）を含む
// （Codex の画面も input_tokens から両方を引いて残りを出す。codex-rs/tui/src/chatwidget/statusline_state/usage.rs）
export function tokens(u: Usage) {
  const input = u.input_tokens
  const cached = u["input_tokens_details.cached_tokens"]
  const written = u["input_tokens_details.cache_write_tokens"]
  return {
    input: input === undefined ? undefined : input - (cached ?? 0) - (written ?? 0),
    cacheRead: cached,
    cacheNew: written,
    output: u.output_tokens,
  }
}

// ---- スレッドと事実 ----

// 会話の糸は thread-id のヘッダー。親の糸の thread-id はセッションの session-id と同じ
export function threadOf(headers: Headers): string {
  const thread = headers.get("thread-id")
  return !thread || thread === headers.get("session-id") ? MAIN_THREAD : thread
}

// Codex のサブエージェント（spawn_agent など）と AI 間メッセージの事実は取り出さない（空を返す）
export const factsOf = (_item: unknown): ItemFacts => ({
  spawns: [],
  started: [],
  returns: [],
  sends: [],
  receipts: [],
})

// ---- 中身の分け方 ----
// 場所（input の項目の種類と役割）と、録った本文で確かめた決まった見出しだけで決める。当てはまらない物は不明

function toolGroup(name: string): Group {
  if (isMatomezuTool(name)) return "matomezu"
  return name.startsWith("mcp__") ? "他の MCP" : "固定"
}

// developer の message の文の頭の見出し。無い物は Codex の指示（固定）、ほかの <見出し> は見出しの名前で固定。
// 利用者の入力より後ろの developer の message は、フックが足した文（話しかけのフックの additionalContext）
const DEVELOPER: { re: RegExp; label: string; group: Group }[] = [
  { re: /^<skills_instructions>/, label: "スキルの一覧", group: "スキル" },
  { re: /^<tools>/, label: "遅延の道具の名前空間の一覧", group: "他の MCP" },
]
// user の message の文の頭の見出し。無い物は利用者の入力、ほかの <見出し> は不明
const USER: { re: RegExp; label: string; group: Group }[] = [
  { re: /^# AGENTS\.md instructions/, label: "AGENTS.md の指示", group: "指示・メモリ" },
  { re: /^<environment_context>/, label: "environment_context", group: "固定" },
]

const tagOf = (text: string) => text.match(/^<([^>\n]{1,60})>/)?.[1]

function textGroup(role: string, text: string, talked: boolean): { label: string; group: Group } {
  if (role === "developer") {
    if (talked) return { label: "フックの文", group: "フック" }
    const known = DEVELOPER.find(k => k.re.test(text))
    if (known) return known
    const tag = tagOf(text)
    return tag ? { label: tag, group: "固定" } : { label: "Codex の指示", group: "固定" }
  }
  if (role === "user") {
    const known = USER.find(k => k.re.test(text))
    if (known) return known
    const tag = tagOf(text)
    return tag ? { label: tag, group: "不明" } : { label: "利用者の入力", group: "会話" }
  }
  if (role === "assistant") return { label: "返答", group: "会話" }
  return { label: text.replace(/\s+/g, " ").slice(0, 40), group: "不明" }
}

const asText = (c: unknown) => (typeof c === "string" ? c : JSON.stringify(c, null, 1))

// 道具の結果の文（input_text の並びなら文をつないだ物）
const outputText = (output: unknown) =>
  Array.isArray(output) && output.every(p => typeof (p as ContentPart)?.text === "string")
    ? output.map(p => (p as ContentPart).text).join("")
    : asText(output)

// usage の attribution.items.<項目の id>.<種類> を、項目の id ごとのトークンに
export function attributionOf(usage: Usage): Map<string, Omit<ItemTokens, "parts">> {
  const items = new Map<string, Omit<ItemTokens, "parts">>()
  for (const [key, value] of Object.entries(usage)) {
    const m = key.match(/^attribution\.items\.(.+)\.(input_tokens|cached_tokens|cache_write_tokens)$/)
    if (!m?.[1]) continue
    const t = items.get(m[1]) ?? { input: 0, cached: 0, written: 0 }
    if (m[2] === "input_tokens") t.input = value
    else if (m[2] === "cached_tokens") t.cached = value
    else t.written = value
    items.set(m[1], t)
  }
  return items
}

export function classify(body: ResponsesBody, usage: Usage = {}): Part[] {
  const input = body.input ?? []
  const attribution = attributionOf(usage)
  const names = new Map(input.flatMap(toolUses).map(u => [u.id, u.name]))
  const parts: Part[] = []
  let talked = false
  input.forEach((item, i) => {
    const where = `input${i}`
    const start = parts.length
    if (item.type === "additional_tools") {
      ;(item.tools ?? []).forEach((t, k) => {
        const inner = t.type === "namespace" ? (t.tools ?? []).map(tool => ({ ns: t.name, tool })) : [{ tool: t }]
        const group: Group =
          inner.some(isMatomezuOf) || (t.name !== undefined && isMatomezuNamespace(t.name))
            ? "matomezu"
            : toolGroup(t.name ?? "")
        parts.push({
          where: `${where}.tools[${k}]`,
          label: `${t.type === "namespace" ? "道具の名前空間" : "道具"} ${t.name ?? "?"}`,
          group,
          chars: JSON.stringify(t).length,
          text: JSON.stringify(t, null, 1),
        })
      })
    } else if (item.type === "message") {
      textsOf(item).forEach((p, j) => {
        const text = p.text ?? asText(p)
        const g = textGroup(item.role ?? "", text, talked)
        parts.push({ where: `${where}[${j}]`, ...g, chars: text.length, text })
        if (g.label === "利用者の入力") talked = true
      })
    } else if (item.type === "custom_tool_call" || item.type === "function_call") {
      const name = toolUses(item)[0]?.name ?? item.name ?? "?"
      const text = item.type === "custom_tool_call" ? (item.input ?? "") : (item.arguments ?? "")
      parts.push({
        where,
        label: `呼び出し ${name}`,
        group: isMatomezuTool(name) ? "matomezu" : "会話",
        chars: JSON.stringify(item).length,
        text,
      })
    } else if (item.type === "custom_tool_call_output" || item.type === "function_call_output") {
      const name = names.get(item.call_id ?? "") ?? "?"
      parts.push({
        where,
        label: `結果 ${name}`,
        group: isMatomezuTool(name) ? "matomezu" : "会話",
        chars: chars(item.output),
        text: outputText(item.output),
      })
    } else {
      const text = JSON.stringify(item, null, 1)
      parts.push({ where, label: item.type, group: "不明", chars: JSON.stringify(item).length, text })
    }
    const t = typeof item.id === "string" ? attribution.get(item.id) : undefined
    const first = parts[start]
    if (t && first) first.itemTokens = { ...t, parts: parts.length - start }
  })
  return parts
}

// ---- 返答 ----
// SSE の response.output_item.done に項目の全体が来る。done の前に切れた項目は、added と delta から組む

function toReply(item: Item, text?: string): ReplyBlock {
  if (item.type === "message")
    return {
      type: "text",
      text:
        text ??
        textsOf(item)
          .map(p => p.text ?? "")
          .join(""),
    }
  if (item.type === "custom_tool_call")
    return { type: "tool_use", name: item.name ?? "?", input: text ?? item.input ?? "" }
  if (item.type === "function_call")
    return { type: "tool_use", name: item.name ?? "?", input: text ?? item.arguments ?? "" }
  return { type: "unknown", text: JSON.stringify(item, null, 1) }
}

export function parseReply(raw: string): ReplyBlock[] {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith("{")) {
    try {
      const output = JSON.parse(trimmed).output
      return Array.isArray(output) ? output.map((i: Item) => toReply(i)) : []
    } catch {
      return []
    }
  }
  const items = new Map<number, { item: Item; text?: string; done: boolean }>()
  for (const event of sseEvents(raw)) {
    const index = event.output_index
    if (typeof index !== "number") continue
    if (event.type === "response.output_item.added" || event.type === "response.output_item.done") {
      items.set(index, { item: event.item as Item, done: event.type === "response.output_item.done" })
    } else if (typeof event.delta === "string" && String(event.type).endsWith(".delta")) {
      const it = items.get(index)
      if (it && !it.done) it.text = (it.text ?? "") + event.delta
    }
  }
  return [...items.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, it]) => (it.done ? toReply(it.item) : toReply(it.item, it.text ?? "")))
}

export const codex: Client<ResponsesBody> = {
  name: "codex",
  head: "/codex",
  upstream: "https://chatgpt.com/backend-api/codex",
  keepHeaders: new Set([
    "content-type",
    "accept",
    "user-agent",
    "originator",
    "session-id",
    "thread-id",
    "x-codex-turn-metadata",
  ]),
  recorded: (method, path) => method === "POST" && path === "/responses",
  sessionIdOf: (_body, headers) => headers.get("session-id") ?? "",
  // 流れは会話の糸（thread-id）。サブエージェントは別の糸になる
  streamOf: (body, headers) => hash(headers.get("thread-id") ?? body.model ?? "").slice(0, 4),
  threadOf,
  workroomNameOf,
  summarize,
  divergeAt,
  classify,
  // usage は最後の response.completed の response に来る
  usageOfEvent: event =>
    event.type === "response.completed" ? (event.response as { usage?: unknown } | undefined)?.usage : undefined,
  endEvent: "response.completed",
  tokens,
  parseReply,
  toolUses,
  toolResults,
  factsOf,
  // 道具の説明（additional_tools）も input の頭の項目なので、並びの項目として 1 度だけ保存される
  split: ({ input, ...rest }) => ({ rest, fixed: {}, list: { name: "input", items: input ?? [] } }),
  probeOf: () => undefined,
}
