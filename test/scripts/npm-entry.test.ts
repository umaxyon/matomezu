import { expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BIN_DIR, binEntry, INSTALLED_NAME } from "../../scripts/npm-pack/manifest"

// 入れた後の形をまねる: <root>/node_modules/matomezu（入口と package.json）と、<root>/node_modules/@matomezu/cli-<os>-<cpu>/bin/matomezu（呼ばれ方を書き出す偽の実行ファイル）
const installed = (version: string) => {
  const root = mkdtempSync(join(tmpdir(), "matomezu-entry-"))
  const main = join(root, "node_modules", "matomezu")
  mkdirSync(join(main, "bin"), { recursive: true })
  writeFileSync(join(main, "bin", "matomezu.js"), binEntry)
  writeFileSync(join(main, "package.json"), JSON.stringify({ name: "matomezu", version }))
  const cli = join(root, "node_modules", "@matomezu", `cli-${process.platform}-${process.arch}`, "bin")
  mkdirSync(cli, { recursive: true })
  writeFileSync(join(cli, "matomezu"), `#!/bin/sh\necho "$0 $*"\n`)
  chmodSync(join(cli, "matomezu"), 0o755)
  const home = join(root, "home")
  mkdirSync(home)
  return { entry: join(main, "bin", "matomezu.js"), home }
}

const run = (entry: string, home: string) =>
  Bun.spawn(["node", entry, "version"], { env: { ...process.env, HOME: home }, stdout: "pipe", stderr: "pipe" })

test("入口は実行ファイルを版ごとの置き場に写してそこから動かし、今入っている版の印を書く", async () => {
  if (process.platform === "win32") return
  const { entry, home } = installed("1.2.3")
  const p = run(entry, home)
  const out = await new Response(p.stdout).text()
  expect(await p.exited).toBe(0)
  const copied = join(home, ...BIN_DIR, "1.2.3", "matomezu")
  expect(out.trim()).toBe(`${copied} version`)
  expect(JSON.parse(readFileSync(join(home, ...BIN_DIR, INSTALLED_NAME), "utf8"))).toEqual({
    version: "1.2.3",
    exe: copied,
  })
})

test("入口が同時に何本動いても、どれも写した物を最後まで動かす", async () => {
  if (process.platform === "win32") return
  const { entry, home } = installed("2.0.0")
  const ps = Array.from({ length: 8 }, () => run(entry, home))
  const outs = await Promise.all(ps.map(p => new Response(p.stdout).text()))
  expect(await Promise.all(ps.map(p => p.exited))).toEqual(ps.map(() => 0))
  const copied = join(home, ...BIN_DIR, "2.0.0", "matomezu")
  for (const o of outs) expect(o.trim()).toBe(`${copied} version`)
})
