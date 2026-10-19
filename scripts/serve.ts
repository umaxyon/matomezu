// web/dist を配る静的なサーバー。bun scripts/serve.ts <ポート>
import { join, normalize } from "node:path";

const DIST = join(import.meta.dir, "../web/dist");
const port = Number(process.argv[2] ?? 5300);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname));
    const file = Bun.file(join(DIST, path === "/" ? "index.html" : path));
    if (!file.name?.startsWith(DIST) || !(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file);
  },
});
console.log(`http://localhost:${port}`);
