// AI（Claude Code と Codex）が API に送るリクエストを記録する中継。何がどれだけ場所を取り、キャッシュがどこで切れたかを見る
//   bun scripts/relay-log.ts serve [--db <file>（既定は ~/.local/state/matomezu-relay/central.db）] [--port 18951] [--view-port 18952] [--no-body] [--pid-file <file>]
//     127.0.0.1 で待ち受け、受けた物をそのまま AI ごとの上流へ渡す。全セッションが 1 つの中継につなぎ、記録は 1 つの SQLite に入る
//     AI は道の頭で分ける: /v1/... は Claude Code（上流は api.anthropic.com）、/codex/... は Codex（/codex を外した残りを
//     ChatGPT の Codex の窓口へ）。本文の読み方は AI ごとの部品（scripts/relay-log/clients/）が受け持つ
//     セッションは AI のセッション id（Claude Code は本文の metadata、Codex は session-id ヘッダー）で区別する。表示の名前は
//     matomezu に join したときのワークルーム名（本文に入る Workroom name の行を拾う。join し直せば名前も変わる）。join 前は
//     session_id の 8 字。道の頭のあとに /s/<名前> を付けたときは、join 前の名前になる（/s/<名前> は外して渡す）
//     scripts/claude-relay.sh・scripts/codex-relay.sh [AI の引数...] がこれを立てて claude・codex を起動する
//     ビューワー（時間順の一覧と詳細、セッションと AI の絞り込み、/timeline のセッションとサブエージェントの帯、/mcp のランキング）は
//     --view-port で同じプロセスが配る
//     --pid-file には待ち受けを始めたあとで自分の pid を書く（起こした側の $! は setsid が間に入ると別のプロセスになる）
//     --no-body のときは本文（会話の全文が入る）を残さず、数字の要約だけにする。認証のヘッダーの値はどちらにも残さない
//   bun scripts/relay-log.ts report [--db ...] [--session <名前>]   リクエストごとの表と、大きい結果の上位にまとめる
//   bun scripts/relay-log.ts purge [--db ...] [--before <ISO の日時>]  記録を消す（--before なしは全部）
// 字数は JSON にしたときの文字の数で、トークンの数ではない。トークンは API が返した usage を部品が同じ意味にそろえた列で見る
import { writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { clientOf, clientOfPath } from "./relay-log/clients"
import { UsageReader, usageFromJson } from "./relay-log/common"
import { isMatomezuTool } from "./relay-log/matomezu"
import { openStore, type Store } from "./relay-log/store"
import type { ClientName, Entry } from "./relay-log/types"
import { startViewer } from "./relay-log/viewer"

// 上流へ渡さないヘッダー（つなぎ方は中継が決める。圧縮は外して SSE をそのまま読めるようにする）
const DROP_UPSTREAM = new Set(["host", "connection", "content-length", "accept-encoding"])

// keep に無いヘッダーは名前だけを残す
export function headersForLog(headers: Headers, keep: Set<string>): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, name) => {
    out[name] = keep.has(name.toLowerCase()) ? value : "<dropped>"
  })
  return out
}

// upstream は AI ごとの上流の差し替え（無い AI は部品の上流）
export type RelayOptions = {
  port: number
  store: Store
  keepBody?: boolean
  upstream?: Partial<Record<ClientName, string>>
}

// 道の頭で AI を決め、頭を外した残りの /s/<名前>/... からセッション名を取る。名前は英数字と _ . - の 40 字まで（ほかは unnamed）
export function routeOf(pathname: string): { client: ClientName; session: string; path: string } {
  const client = clientOfPath(pathname)
  const rest = pathname.slice(client.head.length) || "/"
  const m = rest.match(/^\/s\/([^/]+)(\/.*)?$/)
  if (!m) return { client: client.name, session: "unnamed", path: rest }
  const name = m[1] ?? ""
  return { client: client.name, session: /^[\w.-]{1,40}$/.test(name) ? name : "unnamed", path: m[2] ?? "/" }
}

export function startRelay({ port, store, keepBody = true, upstream = {} }: RelayOptions) {
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
      const client = clientOf(route.client)
      const headers = new Headers()
      req.headers.forEach((value, name) => {
        if (!DROP_UPSTREAM.has(name.toLowerCase())) headers.set(name, value)
      })
      headers.set("accept-encoding", "identity")
      const raw = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer()
      const recorded = client.recorded(req.method, route.path)
      const t0 = Date.now()
      const res = await fetch((upstream[route.client] ?? client.upstream) + route.path + url.search, {
        method: req.method,
        headers,
        body: raw,
        signal: req.signal,
      })
      const resHeaders = new Headers(res.headers)
      resHeaders.delete("content-encoding")
      resHeaders.delete("content-length")
      if (!recorded || !res.body) return new Response(res.body, { status: res.status, headers: resHeaders })

      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(new TextDecoder().decode(raw))
      } catch {}
      const sessionId = client.sessionIdOf(body, req.headers)
      const workroom = client.workroomNameOf(body)
      if (workroom) store.setName(sessionId, workroom)
      const full = client.summarize(body)
      const { prefix, results, ...summary } = full
      const stream = client.streamOf(body, req.headers, full)
      const thread = client.threadOf(req.headers)
      // 食い違いは流れ（キャッシュの前置きを比べる単位）ごとに見る。同じ種類のサブエージェントが並ぶと流れがそろうので、スレッドでも分ける
      const key = `${route.client}:${sessionId || route.session}:${thread}:${stream}`
      const diverge = client.divergeAt(lastPrefix.get(key), prefix)
      lastPrefix.set(key, prefix)
      // 道具の結果の id は AI ごとに付くので、AI で分けて覚える
      const newResults = results.filter(r => !seen.has(`${route.client}:${r.id}`))
      for (const r of newResults) seen.add(`${route.client}:${r.id}`)
      const parts = client.split(body)
      const split = keepBody
        ? { ...parts, rest: { ...parts.rest, headers: headersForLog(req.headers, client.keepHeaders) } }
        : undefined
      const probe = client.probeOf(body)

      // SSE かは content-type か、本文の頭（event: か data: の行）で決める
      let sse = (res.headers.get("content-type") ?? "").includes("text/event-stream")
      const [pass, copy] = res.body.tee()
      // 記録は返答を待たせずに走らせる。呼び手が途中で接続を切ると copy の読み取りが AbortError で止まるので、
      // そこまでを記録する（拒否を放っておくと中継のプロセスごと落ちる）。返答の終わりのイベントより前に切れた物だけを中断とする
      // （Codex は終わりのイベントを受けると、上流が閉じる前に接続を切る）
      ;(async () => {
        const reader = new UsageReader(client)
        const decoder = new TextDecoder()
        let text = ""
        let aborted = false
        let first = true
        try {
          for await (const chunk of copy) {
            const s = decoder.decode(chunk, { stream: true })
            if (first) sse ||= /^(event|data):/.test(s.trimStart())
            first = false
            if (sse) reader.feed(s)
            if (!sse || keepBody) text += s
          }
        } catch (e) {
          if (!(e instanceof Error && e.name === "AbortError")) throw e
          aborted = true
        }
        reader.end()
        if (reader.ended) aborted = false
        const usage = sse ? reader.usage : usageFromJson(text)
        store.add(
          {
            client: route.client,
            at: new Date(t0).toISOString(),
            session: route.session,
            sessionId,
            status: res.status,
            ms: Date.now() - t0,
            stream,
            diverge,
            summary,
            newResults,
            tokens: client.tokens(usage),
            usage,
            ...(res.status >= 400 ? { error: text.slice(0, 500) } : {}),
            ...(probe ? { probe } : {}),
            ...(aborted ? { aborted } : {}),
          },
          split,
          keepBody ? text : undefined,
          { thread, items: parts.list.items },
        )
      })().catch(e => console.error("relay-log: 記録に失敗した", e))
      return new Response(pass, { status: res.status, headers: resHeaders })
    },
  })
}

const num = (n: number | undefined) => (n === undefined ? "-" : n.toLocaleString("en-US"))

export function report(entries: Entry[]): string {
  const head = [
    "#",
    "AI",
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
  // input・cache_read・cache_new・output は部品がそろえた意味（Entry の tokens）
  const rows = entries.map(e => {
    const u = e.tokens
    const s = e.summary
    return [
      String(e.id),
      e.client,
      e.session,
      e.at.slice(11, 19),
      e.stream,
      s.model,
      String(s.messages),
      num(u.input),
      num(u.cacheRead),
      num(u.cacheNew),
      num(u.output),
      e.probe
        ? `${e.probe} の確かめ（${e.status}）`
        : e.status >= 400
          ? `status ${e.status}`
          : e.aborted
            ? "中断"
            : e.diverge,
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
  const matomezu = all.filter(r => isMatomezuTool(r.tool)).reduce((n, r) => n + r.chars, 0)
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
          `- cache_control: ${last.marks === undefined ? "-" : last.marks.join(" ") || "なし"}`,
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
    const pidFile = flag(args, "--pid-file")
    if (pidFile) writeFileSync(pidFile, `${process.pid}\n`)
    console.log(`relay-log: 127.0.0.1:${port} → AI ごとの上流、ビューワー http://127.0.0.1:${viewPort}、記録は ${db}`)
  } else if (args[0] === "report") {
    console.log(report(openStore(db).entries(flag(args, "--session"))))
  } else if (args[0] === "purge") {
    console.log(`${openStore(db).purge(flag(args, "--before"))} 件を消した`)
  } else {
    console.error(usage)
    process.exit(1)
  }
}
