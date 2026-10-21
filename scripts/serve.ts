// ビルドした画面を配る静的なサーバー（実際のブラウザのテスト用）。bun scripts/serve.ts <ポート> [フォルダ（既定は web/dist）]
import { join, normalize, resolve } from "node:path"

const port = Number(process.argv[2] ?? 5300)
const dir = resolve(process.argv[3] ?? join(import.meta.dir, "../web/dist"))

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname))
    const file = Bun.file(join(dir, path === "/" ? "index.html" : path))
    if (!file.name?.startsWith(dir) || !(await file.exists())) return new Response("not found", { status: 404 })
    return new Response(file)
  },
})
console.log(`http://localhost:${port}`)
