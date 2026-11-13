// Claude Code が API に送るリクエストを記録する中継。何がどれだけ場所を取り、キャッシュがどこで切れたかを見る
//   bun scripts/relay-log.ts [--port 18951] [--out <dir>] [--full]
//     127.0.0.1 で待ち受け、受けた物をそのまま api.anthropic.com へ渡す。記録したいセッションは別の端末で
//     ANTHROPIC_BASE_URL=http://127.0.0.1:18951 claude と起動する（サブスクのログインのままで通る）
//     記録は <dir>（無ければ tmp/relay-log/<日時>）の index.jsonl に、/v1/messages の 1 リクエストを 1 行で書く
//     --full のときだけ、本文の全文を req-NNNN.json に残す（会話の全文が入る）。認証のヘッダーの値はどちらにも残さない
//   bun scripts/relay-log.ts report <dir>
//     index.jsonl をリクエストごとの表と、大きい結果の上位にまとめる
// 字数は JSON にしたときの文字の数で、トークンの数ではない。トークンは API が返した usage の列で見る
import { createHash } from "node:crypto"
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const UPSTREAM = "https://api.anthropic.com"
const MATOMEZU = "mcp__matomezu__"
// 値を記録してよいヘッダー。ほかは名前だけを残す
const KEEP_HEADERS = new Set(["content-type", "accept", "user-agent", "x-app", "anthropic-version", "anthropic-beta"])
// 上流へ渡さないヘッダー（つなぎ方は中継が決める。圧縮は外して SSE をそのまま読めるようにする）
const DROP_UPSTREAM = new Set(["host", "connection", "content-length", "accept-encoding"])

export type Block = { type: string; [key: string]: unknown }
export type Message = { role: string; content: string | Block[] }
export type Body = {
  model?: string
  system?: unknown
  tools?: { name: string; defer_loading?: boolean }[]
  messages?: Message[]
}

export type ResultSize = { id: string; tool: string; chars: number }
export type Summary = {
  model: string
  messages: number
  systemHash: string
  toolsHash: string
  systemChars: number
  toolsN: number
  toolsChars: number
  matomezuToolsN: number
  matomezuToolsChars: number
  textChars: number
  resultChars: number
  matomezuResultChars: number
  // cache_control の付いた所（tools[i]・system[i]・msg<i>[j]）と、その長さ（5m か 1h）
  marks: string[]
  // キャッシュの前置きと同じ順に積んだハッシュ: [tools, +system, +msg0, +msg1, …]
  prefix: string[]
  results: ResultSize[]
}
export type Usage = Record<string, number>
export type Entry = {
  id: number
  at: string
  status: number
  ms: number
  stream: string
  // 同じ流れの前のリクエストと、前置きが最初に食い違った所（tools・system・msg<i>）。前が無いか、伸びただけなら none
  diverge: string
  summary: Omit<Summary, "prefix" | "results">
  // この中継で初めて見た tool_result（同じ id は毎回送り直されるので、初めの 1 回だけ数える）
  newResults: ResultSize[]
  usage: Usage
  error?: string
}

const chars = (value: unknown) => JSON.stringify(value ?? "").length
const hash = (...values: unknown[]) => createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 10)

export function headersForLog(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, name) => {
    out[name] = KEEP_HEADERS.has(name.toLowerCase()) ? value : "<dropped>"
  })
  return out
}

// tool_use の id から、呼んだツールの名前を引く表
function toolNames(messages: Message[]) {
  const names = new Map<string, string>()
  for (const m of messages) {
    if (typeof m.content === "string") continue
    for (const b of m.content) if (b.type === "tool_use") names.set(b.id as string, b.name as string)
  }
  return names
}

export function summarize(body: Body): Summary {
  const messages = body.messages ?? []
  const tools = body.tools ?? []
  const names = toolNames(messages)
  const results: ResultSize[] = []
  let textChars = 0
  for (const m of messages) {
    if (typeof m.content === "string") {
      textChars += m.content.length
      continue
    }
    for (const b of m.content) {
      if (b.type === "tool_result") {
        const id = b.tool_use_id as string
        results.push({ id, tool: names.get(id) ?? "?", chars: chars(b.content) })
      } else if (b.type === "text") textChars += (b.text as string).length
    }
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
  const matomezuTools = tools.filter(t => t.name.startsWith(MATOMEZU))
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
    matomezuResultChars: results.filter(r => r.tool.startsWith(MATOMEZU)).reduce((n, r) => n + r.chars, 0),
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

// 前置きのハッシュの並びが、最初に食い違った所
export function divergeAt(prev: string[] | undefined, cur: string[]): string {
  if (!prev) return "none"
  const n = Math.min(prev.length, cur.length)
  for (let i = 0; i < n; i++) if (prev[i] !== cur[i]) return i === 0 ? "tools" : i === 1 ? "system" : `msg${i - 2}`
  return cur.length < prev.length ? `msg${cur.length - 2}` : "none"
}

function addUsage(into: Usage, value: unknown, prefix = "") {
  if (!value || typeof value !== "object") return
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number") into[prefix + k] = v
    else if (v && typeof v === "object" && !Array.isArray(v)) addUsage(into, v, `${prefix + k}.`)
  }
}

// SSE を届いた順に読み、usage を拾う。入力の側は message_start、出力は message_delta に来る。チャンクは行の途中で切れてよい
export class UsageReader {
  private rest = ""
  readonly usage: Usage = {}
  feed(chunk: string) {
    const lines = (this.rest + chunk).split("\n")
    this.rest = lines.pop() ?? ""
    for (const line of lines) this.line(line)
  }
  end() {
    if (this.rest) this.line(this.rest)
    this.rest = ""
  }
  private line(line: string) {
    if (!line.startsWith("data:")) return
    try {
      const event = JSON.parse(line.slice(5))
      if (event.type === "message_start") addUsage(this.usage, event.message?.usage)
      if (event.type === "message_delta") addUsage(this.usage, event.usage)
    } catch {}
  }
}

export function usageFromJson(text: string): Usage {
  const usage: Usage = {}
  try {
    addUsage(usage, JSON.parse(text).usage)
  } catch {}
  return usage
}

export type RelayOptions = { port: number; out: string; full: boolean; upstream?: string }

export function startRelay({ port, out, full, upstream = UPSTREAM }: RelayOptions) {
  mkdirSync(out, { recursive: true })
  const index = join(out, "index.jsonl")
  const lastPrefix = new Map<string, string[]>()
  const seen = new Set<string>()
  let seq = 0
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const headers = new Headers()
      req.headers.forEach((value, name) => {
        if (!DROP_UPSTREAM.has(name.toLowerCase())) headers.set(name, value)
      })
      headers.set("accept-encoding", "identity")
      const raw = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer()
      const recorded = req.method === "POST" && url.pathname === "/v1/messages"
      const t0 = Date.now()
      const res = await fetch(upstream + url.pathname + url.search, {
        method: req.method,
        headers,
        body: raw,
        signal: req.signal,
      })
      const resHeaders = new Headers(res.headers)
      resHeaders.delete("content-encoding")
      resHeaders.delete("content-length")
      if (!recorded || !res.body) return new Response(res.body, { status: res.status, headers: resHeaders })

      const id = ++seq
      let body: Body = {}
      try {
        body = JSON.parse(new TextDecoder().decode(raw))
      } catch {}
      const { prefix, results, ...summary } = summarize(body)
      const stream = hash(summary.model, summary.systemHash).slice(0, 4)
      const diverge = divergeAt(lastPrefix.get(stream), prefix)
      lastPrefix.set(stream, prefix)
      const newResults = results.filter(r => !seen.has(r.id))
      for (const r of newResults) seen.add(r.id)
      if (full) {
        const file = join(out, `req-${String(id).padStart(4, "0")}.json`)
        writeFileSync(file, JSON.stringify({ headers: headersForLog(req.headers), body }, null, 1))
      }

      const sse = (res.headers.get("content-type") ?? "").includes("text/event-stream")
      const [pass, copy] = res.body.tee()
      ;(async () => {
        const reader = new UsageReader()
        const decoder = new TextDecoder()
        let text = ""
        for await (const chunk of copy) {
          const s = decoder.decode(chunk, { stream: true })
          if (sse) reader.feed(s)
          else text += s
        }
        reader.end()
        const entry: Entry = {
          id,
          at: new Date(t0).toISOString(),
          status: res.status,
          ms: Date.now() - t0,
          stream,
          diverge,
          summary,
          newResults,
          usage: sse ? reader.usage : usageFromJson(text),
          ...(res.status >= 400 ? { error: text.slice(0, 500) } : {}),
        }
        appendFileSync(index, `${JSON.stringify(entry)}\n`)
      })()
      return new Response(pass, { status: res.status, headers: resHeaders })
    },
  })
}

const num = (n: number | undefined) => (n === undefined ? "-" : n.toLocaleString("en-US"))

export function report(lines: string[]): string {
  const entries: Entry[] = lines.filter(l => l.trim() !== "").map(l => JSON.parse(l))
  const head = [
    "#",
    "時刻",
    "流れ",
    "model",
    "msgs",
    "input",
    "cache_read",
    "cache_new",
    "output",
    "食い違い",
    "新しい結果(字)",
    "matomezu の結果(字)/結果の全部(字)",
  ]
  const rows = entries.map(e => {
    const u = e.usage
    const s = e.summary
    return [
      String(e.id),
      e.at.slice(11, 19),
      e.stream,
      s.model,
      String(s.messages),
      num(u.input_tokens),
      num(u.cache_read_input_tokens),
      num(u.cache_creation_input_tokens),
      num(u.output_tokens),
      e.status >= 400 ? `status ${e.status}` : e.diverge,
      num(e.newResults.reduce((n, r) => n + r.chars, 0)),
      `${num(s.matomezuResultChars)}/${num(s.resultChars)}`,
    ]
  })
  const table = [head, ...rows].map(r => `| ${r.join(" | ")} |`)
  table.splice(1, 0, `|${head.map(() => "---").join("|")}|`)

  const all = entries.flatMap(e => e.newResults.map(r => ({ ...r, at: e.id })))
  const top = [...all].sort((a, b) => b.chars - a.chars).slice(0, 10)
  const byTool = new Map<string, { n: number; chars: number }>()
  for (const r of all) {
    const t = byTool.get(r.tool) ?? { n: 0, chars: 0 }
    byTool.set(r.tool, { n: t.n + 1, chars: t.chars + r.chars })
  }
  const total = all.reduce((n, r) => n + r.chars, 0)
  const matomezu = all.filter(r => r.tool.startsWith(MATOMEZU)).reduce((n, r) => n + r.chars, 0)
  const last = entries.at(-1)?.summary
  return [
    "## リクエスト",
    ...table,
    "",
    "## 大きい結果の上位",
    ...top.map(r => `- #${r.at} ${r.tool} ${num(r.chars)} 字`),
    "",
    "## ツールごとの結果（初めて見た分だけ）",
    ...[...byTool]
      .sort((a, b) => b[1].chars - a[1].chars)
      .map(([tool, t]) => `- ${tool}: ${t.n} 回、${num(t.chars)} 字`),
    `- matomezu の割合: ${total ? Math.round((matomezu / total) * 100) : 0}%（${num(matomezu)} / ${num(total)} 字）`,
    ...(last
      ? [
          "",
          "## 最後のリクエストの内訳",
          `- system: ${num(last.systemChars)} 字、ツールの説明: ${last.toolsN} 個 ${num(last.toolsChars)} 字（matomezu ${last.matomezuToolsN} 個 ${num(last.matomezuToolsChars)} 字）`,
          `- 会話の文: ${num(last.textChars)} 字、結果: ${num(last.resultChars)} 字（matomezu ${num(last.matomezuResultChars)} 字）`,
          `- cache_control: ${last.marks.join(" ") || "なし"}`,
        ]
      : []),
  ].join("\n")
}

function flag(args: string[], name: string) {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args[0] === "report") {
    const dir = args[1]
    if (!dir) throw new Error("usage: bun scripts/relay-log.ts report <dir>")
    console.log(report(readFileSync(join(dir, "index.jsonl"), "utf8").split("\n")))
  } else {
    const port = Number(flag(args, "--port") ?? 18951)
    const out = flag(args, "--out") ?? join("tmp", "relay-log", new Date().toISOString().replace(/[:.]/g, "-"))
    startRelay({ port, out, full: args.includes("--full") })
    console.log(`relay-log: 127.0.0.1:${port} → ${UPSTREAM}、記録は ${out}`)
    console.log(`記録するセッションは ANTHROPIC_BASE_URL=http://127.0.0.1:${port} claude で起動する`)
  }
}
