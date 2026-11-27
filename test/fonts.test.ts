// 字の幅の表が、配るフォントから作り直したものと同じか（フォントの版を変えたら bun scripts/fonts.ts widths）。画面が先に読む字の範囲が、範囲の分け方に合っているか
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")

test("web/src/plugins/base/text/noto-sans-jp.ts は配るフォントから作り直したものと同じ", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "fonts-")), "noto-sans-jp.ts")
  const run = Bun.spawn(["bun", "scripts/fonts.ts", "widths", out], { cwd: ROOT, stdout: "ignore", stderr: "inherit" })
  expect(await run.exited).toBe(0)
  expect(readFileSync(join(ROOT, "web/src/plugins/base/text/noto-sans-jp.ts"), "utf8")).toBe(readFileSync(out, "utf8"))
})

test("先に読む字（first.txt）は、1 字ずつ別の字の範囲に当たり、よく使う範囲（かなと latin）を含む", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fonts-"))
  const run = Bun.spawn(["bun", "scripts/fonts.ts", "copy", dir], { cwd: ROOT, stdout: "ignore", stderr: "inherit" })
  expect(await run.exited).toBe(0)
  const css = readFileSync(join(dir, "noto-sans-jp.css"), "utf8")
  const faces = [...css.matchAll(/noto-sans-jp-\[?([0-9a-z]+)\]?-400-normal \*\/[^}]*unicode-range:([^;]*);/g)].map(
    m => ({
      name: m[1],
      has: (p: number) =>
        (m[2] ?? "").split(",").some(part => {
          const [from, to] = part.trim().replace(/^U\+/i, "").split("-")
          const start = Number.parseInt(from ?? "", 16)
          return p >= start && p <= (to === undefined ? start : Number.parseInt(to, 16))
        }),
    }),
  )
  const hit = [...readFileSync(join(dir, "first.txt"), "utf8")].map(c => {
    const p = c.codePointAt(0) ?? -1
    return faces.filter(f => f.has(p)).map(f => f.name)
  })
  expect(hit.every(names => names.length === 1)).toBe(true)
  const names = hit.map(n => n[0])
  expect(new Set(names).size).toBe(names.length)
  expect(names).toContain("119")
  expect(names).toContain("latin")
})
