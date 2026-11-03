// 常駐が埋め込む engine.js が、今のソースから作ったものと同じか（ソースを変えたら bun run build:engine）
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")

test("internal/engine/engine.js は web/src/engine/engine.ts から作り直したものと同じ", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "engine-")), "engine.js")
  // package.json の build:engine と同じ組み方で、出す先だけ変える
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>
  const args = scripts["build:engine"]!.split(" ")
  args[args.indexOf("--outfile") + 1] = out
  // bun test が入れる NODE_ENV=test を組み方に混ぜない（production で組む）
  const env = { ...process.env, NODE_ENV: "production" }
  const build = Bun.spawn(args, { cwd: ROOT, env, stdout: "ignore", stderr: "inherit" })
  expect(await build.exited).toBe(0)
  expect(readFileSync(join(ROOT, "internal/engine/engine.js"), "utf8")).toBe(readFileSync(out, "utf8"))
})
