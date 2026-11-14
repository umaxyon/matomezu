// relay-log の記録（index.jsonl と --full の req-/res-）を、時間順の一覧と詳細で見るページを配る
//   bun scripts/relay-log.ts view <dir> [--port 18952]
// 127.0.0.1 だけで待ち受ける。記録を書いている最中の中継があっても、ページが定期的に読み直す
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { classify, HIDDEN_BY_DEFAULT, totals } from "./classify"
import { parseReply } from "./reply"

const pad = (id: number) => String(id).padStart(4, "0")
const json = (value: unknown) => Response.json(value)

export function startViewer({ dir, port }: { dir: string; port: number }) {
  const html = readFileSync(join(import.meta.dir, "viewer.html"), "utf8")
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : undefined)
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req) {
      const path = new URL(req.url).pathname
      if (path === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
      if (path === "/api/entries") {
        const text = read("index.jsonl") ?? ""
        return json(
          text
            .split("\n")
            .filter(l => l.trim() !== "")
            .flatMap(l => {
              try {
                return [JSON.parse(l)]
              } catch {
                return []
              }
            }),
        )
      }
      const m = path.match(/^\/api\/(req|res|parts)\/(\d+)$/)
      if (m) {
        const id = Number(m[2])
        if (m[1] === "parts") {
          const text = read(`req-${pad(id)}.json`)
          if (text === undefined) return json(null)
          const parts = classify(JSON.parse(text).body)
          return json({ hidden: HIDDEN_BY_DEFAULT, totals: totals(parts), parts })
        }
        if (m[1] === "req") {
          const text = read(`req-${pad(id)}.json`)
          return text === undefined ? json(null) : json(JSON.parse(text))
        }
        const text = read(`res-${pad(id)}.txt`)
        return json(text === undefined ? null : parseReply(text))
      }
      return new Response("not found", { status: 404 })
    },
  })
}
