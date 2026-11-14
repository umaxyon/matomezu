// Claude Code が API に送るリクエストを記録する中継。何がどれだけ場所を取り、キャッシュがどこで切れたかを見る
//   bun scripts/relay-log.ts serve [--db <file>（既定は ~/.local/state/matomezu-relay/central.db）] [--port 18951] [--view-port 18952] [--no-body]
//     127.0.0.1 で待ち受け、受けた物をそのまま api.anthropic.com へ渡す。全セッションが 1 つの中継につなぎ、記録は 1 つの SQLite に入る
//     セッションは、リクエストにある Claude Code の session_id で区別する。表示の名前は matomezu に join したときのワークルーム名
//     （フックが入れる Workroom name の行を本文から拾う。join し直せば名前も変わる）。join 前は session_id の頭 8 字。
//     ANTHROPIC_BASE_URL の末尾に /s/<名前> を付けたときは、join 前の名前になる（先頭の /s/<名前> は外して渡す）
//     scripts/claude-relay.sh [claude の引数...] がこれを立てて claude を起動する
//     ビューワー（時間順の一覧と詳細、セッションの絞り込み）は --view-port で同じプロセスが配る
//     --no-body のときは本文（会話の全文が入る）を残さず、数字の要約だけにする。認証のヘッダーの値はどちらにも残さない
//   bun scripts/relay-log.ts report [--db ...] [--session <名前>]   リクエストごとの表と、大きい結果の上位にまとめる
//   bun scripts/relay-log.ts purge [--db ...] [--before <ISO の日時>]  記録を消す（--before なしは全部）
// 字数は JSON にしたときの文字の数で、トークンの数ではない。トークンは API が返した usage の列で見る
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"
import { probeOf } from "./relay-log/probe"
import { openStore, type Store } from "./relay-log/store"
import { startViewer } from "./relay-log/viewer"

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
  metadata?: { user_id?: string }
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
  // 中継の URL の /s/<名前> の名前（無ければ unnamed）と、リクエストの metadata にある Claude Code のセッション id
  session: string
  sessionId: string
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
  // Claude Code が起動のときに残りの枠を確かめるリクエスト。429 が返っても作業の失敗ではない
  probe?: "quota"
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

export type RelayOptions = { port: number; store: Store; keepBody?: boolean; upstream?: string }

// /s/<名前>/v1/messages → セッション名と、上流へ渡す道。名前は英数字と _ . - の 40 字まで（ほかは unnamed）
export function routeOf(pathname: string): { session: string; path: string } {
  const m = pathname.match(/^\/s\/([^/]+)(\/.*)?$/)
  if (!m) return { session: "unnamed", path: pathname }
  return { session: /^[\w.-]{1,40}$/.test(m[1]!) ? m[1]! : "unnamed", path: m[2] ?? "/" }
}

export function sessionIdOf(body: Body): string {
  try {
    return JSON.parse(body.metadata?.user_id ?? "{}").session_id ?? ""
  } catch {
    return ""
  }
}

// join のあとにフックが入れる「Workroom name: <名前>」の最後の 1 つ（join し直して名前が変われば、新しい名前になる）
export function workroomNameOf(body: Body): string | undefined {
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

export function startRelay({ port, store, keepBody = true, upstream = UPSTREAM }: RelayOptions) {
  const lastPrefix = new Map<string, string[]>()
  const seen = new Set<string>()
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/__relay/health") return new Response("ok")
      const route = routeOf(url.pathname)
      const headers = new Headers()
      req.headers.forEach((value, name) => {
        if (!DROP_UPSTREAM.has(name.toLowerCase())) headers.set(name, value)
      })
      headers.set("accept-encoding", "identity")
      const raw = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer()
      const recorded = req.method === "POST" && route.path === "/v1/messages"
      const t0 = Date.now()
      const res = await fetch(upstream + route.path + url.search, {
        method: req.method,
        headers,
        body: raw,
        signal: req.signal,
      })
      const resHeaders = new Headers(res.headers)
      resHeaders.delete("content-encoding")
      resHeaders.delete("content-length")
      if (!recorded || !res.body) return new Response(res.body, { status: res.status, headers: resHeaders })

      let body: Body = {}
      try {
        body = JSON.parse(new TextDecoder().decode(raw))
      } catch {}
      const sessionId = sessionIdOf(body)
      const workroom = workroomNameOf(body)
      if (workroom) store.setName(sessionId, workroom)
      const { prefix, results, ...summary } = summarize(body)
      const stream = hash(summary.model, summary.systemHash).slice(0, 4)
      const key = `${sessionId || route.session}:${stream}`
      const diverge = divergeAt(lastPrefix.get(key), prefix)
      lastPrefix.set(key, prefix)
      const newResults = results.filter(r => !seen.has(r.id))
      for (const r of newResults) seen.add(r.id)
      const stored = keepBody ? { ...body, headers: headersForLog(req.headers) } : undefined

      const sse = (res.headers.get("content-type") ?? "").includes("text/event-stream")
      const [pass, copy] = res.body.tee()
      ;(async () => {
        const reader = new UsageReader()
        const decoder = new TextDecoder()
        let text = ""
        for await (const chunk of copy) {
          const s = decoder.decode(chunk, { stream: true })
          if (sse) reader.feed(s)
          if (!sse || keepBody) text += s
        }
        reader.end()
        store.add(
          {
            at: new Date(t0).toISOString(),
            session: route.session,
            sessionId,
            status: res.status,
            ms: Date.now() - t0,
            stream,
            diverge,
            summary,
            newResults,
            usage: sse ? reader.usage : usageFromJson(text),
            ...(res.status >= 400 ? { error: text.slice(0, 500) } : {}),
            ...(probeOf(body) ? { probe: probeOf(body) } : {}),
          },
          stored,
          keepBody ? text : undefined,
        )
      })()
      return new Response(pass, { status: res.status, headers: resHeaders })
    },
  })
}

const num = (n: number | undefined) => (n === undefined ? "-" : n.toLocaleString("en-US"))

export function report(entries: Entry[]): string {
  const head = [
    "#",
    "セッション",
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
      e.session,
      e.at.slice(11, 19),
      e.stream,
      s.model,
      String(s.messages),
      num(u.input_tokens),
      num(u.cache_read_input_tokens),
      num(u.cache_creation_input_tokens),
      num(u.output_tokens),
      e.probe ? `${e.probe} の確かめ（${e.status}）` : e.status >= 400 ? `status ${e.status}` : e.diverge,
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

// 平行作業の worktree のどこから立てても同じ記録になるよう、worktree の外に置く
export const defaultDb = () =>
  join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "matomezu-relay", "central.db")

function flag(args: string[], name: string) {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const db = flag(args, "--db") ?? defaultDb()
  const usage = "usage: bun scripts/relay-log.ts serve|report|purge [--db <file>]"
  if (args[0] === "serve") {
    const port = Number(flag(args, "--port") ?? 18951)
    const viewPort = Number(flag(args, "--view-port") ?? 18952)
    const store = openStore(db)
    startRelay({ port, store, keepBody: !args.includes("--no-body") })
    startViewer({ store, port: viewPort })
    console.log(`relay-log: 127.0.0.1:${port} → ${UPSTREAM}、ビューワー http://127.0.0.1:${viewPort}、記録は ${db}`)
  } else if (args[0] === "report") {
    console.log(report(openStore(db).entries(flag(args, "--session"))))
  } else if (args[0] === "purge") {
    console.log(`${openStore(db).purge(flag(args, "--before"))} 件を消した`)
  } else {
    console.error(usage)
    process.exit(1)
  }
}
