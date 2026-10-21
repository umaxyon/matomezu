// 常駐が埋め込む engine.js が、今のソースから作ったものと同じか（ソースを変えたら bun run build:engine）
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")

test("internal/engine/engine.js は web/src/engine/engine.ts から作り直したものと同じ", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "engine-")), "engine.js")
  const build = Bun.spawn(
    [
      "bun",
      "build",
      "web/src/engine/engine.ts",
      "--target",
      "browser",
      "--format",
      "iife",
      "--minify",
      "--outfile",
      out,
    ],
    { cwd: ROOT, stdout: "ignore", stderr: "inherit" },
  )
  expect(await build.exited).toBe(0)
  expect(readFileSync(join(ROOT, "internal/engine/engine.js"), "utf8")).toBe(readFileSync(out, "utf8"))
})
