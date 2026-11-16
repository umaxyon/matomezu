// relay-log の記録を、時間順の一覧と詳細で見るページ（?open=<id> でその行を開く）と、セッションとサブエージェントの帯と矢印（/timeline）と、
// matomezu の MCP の結果の大きさのランキング（/mcp）を配る（中継と同じプロセスから startViewer で立てる）。/timeline と /mcp は、
// 記録するときに取り出した事実の表を読む
// 127.0.0.1 だけで待ち受け、CORS は付けない。ページは定期的に読み直す。中身と返答は、その行の AI の部品が読む
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { clientOf, clients } from "./clients"
import { HIDDEN_BY_DEFAULT, totals } from "./common"
import { mcpCalls, rank } from "./mcp-rank"
import type { Store } from "./store"
import { timeline } from "./timeline"
import type { ClientName } from "./types"

// /api/timeline の既定の期間（直近の 3 時間）
const DEFAULT_SPAN_MS = 3 * 60 * 60 * 1000

// from と to（ISO の日時）を読む。無いか読めなければ、to は今、from は to の 3 時間前
export function spanOf(params: URLSearchParams, now = Date.now()): { from: string; to: string } {
  const time = (name: string) => {
    const t = Date.parse(params.get(name) ?? "")
    return Number.isNaN(t) ? undefined : t
  }
  const to = time("to") ?? now
  const from = time("from") ?? to - DEFAULT_SPAN_MS
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
}

export function startViewer({ store, port }: { store: Store; port: number }) {
  const html = readFileSync(join(import.meta.dir, "viewer.html"), "utf8")
  const mcpHtml = readFileSync(join(import.meta.dir, "mcp.html"), "utf8")
  const timelineHtml = readFileSync(join(import.meta.dir, "timeline.html"), "utf8")
  const page = (text: string) => new Response(text, { headers: { "content-type": "text/html; charset=utf-8" } })
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname
      if (path === "/") return page(html)
      if (path === "/mcp") return page(mcpHtml)
      if (path === "/timeline") return page(timelineHtml)
      const session = url.searchParams.get("session") ?? undefined
      const asked = url.searchParams.get("client")
      const client = asked && asked in clients ? (asked as ClientName) : undefined
      if (path === "/api/sessions") return Response.json(store.sessions(client))
      if (path === "/api/mcp") return Response.json(rank(mcpCalls(store.mcpRows(session, client))))
      if (path === "/api/timeline") {
        const { from, to } = spanOf(url.searchParams)
        return Response.json(timeline(store.timeline(from, to)))
      }
      if (path === "/api/entries") return Response.json(store.entries(session, client))
      const m = path.match(/^\/api\/(parts|res)\/(\d+)$/)
      if (!m) return new Response("not found", { status: 404 })
      const id = Number(m[2])
      const owner = store.clientOf(id)
      if (!owner) return Response.json(null)
      if (m[1] === "parts") {
        const body = store.body(id)
        if (!body) return Response.json(null)
        const parts = clientOf(owner).classify(body)
        return Response.json({ hidden: HIDDEN_BY_DEFAULT, totals: totals(parts), parts })
      }
      const text = store.reply(id)
      return Response.json(text === undefined ? null : clientOf(owner).parseReply(text))
    },
  })
}
