// 字の幅の表が、配るフォントから作り直したものと同じか（フォントの版を変えたら bun scripts/fonts.ts widths）
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")

test("web/src/core/text/noto-sans-jp.ts は配るフォントから作り直したものと同じ", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "fonts-")), "noto-sans-jp.ts")
  const run = Bun.spawn(["bun", "scripts/fonts.ts", "widths", out], { cwd: ROOT, stdout: "ignore", stderr: "inherit" })
  expect(await run.exited).toBe(0)
  expect(readFileSync(join(ROOT, "web/src/core/text/noto-sans-jp.ts"), "utf8")).toBe(readFileSync(out, "utf8"))
})
