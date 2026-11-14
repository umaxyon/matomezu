// relay-log の記録を、時間順の一覧と詳細で見るページと、matomezu の MCP の結果の大きさのランキング（/mcp）を配る（中継と同じプロセスから startViewer で立てる）
// 127.0.0.1 だけで待ち受け、CORS は付けない。ページは定期的に読み直す
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { classify, HIDDEN_BY_DEFAULT, totals } from "./classify"
import { matomezuCalls, rank } from "./mcp-rank"
import { parseReply } from "./reply"
import type { Store } from "./store"

export function startViewer({ store, port }: { store: Store; port: number }) {
  const html = readFileSync(join(import.meta.dir, "viewer.html"), "utf8")
  const mcpHtml = readFileSync(join(import.meta.dir, "mcp.html"), "utf8")
  const page = (text: string) => new Response(text, { headers: { "content-type": "text/html; charset=utf-8" } })
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname
      if (path === "/") return page(html)
      if (path === "/mcp") return page(mcpHtml)
      if (path === "/api/sessions") return Response.json(store.sessions())
      const session = url.searchParams.get("session") ?? undefined
      if (path === "/api/mcp") return Response.json(rank(matomezuCalls(store.uniqueMessages(session))))
      if (path === "/api/entries") return Response.json(store.entries(session))
      const m = path.match(/^\/api\/(parts|res)\/(\d+)$/)
      if (!m) return new Response("not found", { status: 404 })
      const id = Number(m[2])
      if (m[1] === "parts") {
        const body = store.body(id)
        if (!body) return Response.json(null)
        const parts = classify(body)
        return Response.json({ hidden: HIDDEN_BY_DEFAULT, totals: totals(parts), parts })
      }
      const text = store.reply(id)
      return Response.json(text === undefined ? null : parseReply(text))
    },
  })
}
