// 構造の決まりを見張る: フォルダごとに読み込んでよいもの、状態を変える入口、外の世界に触る所、コメントの言葉
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const SRC = join(ROOT, "web/src")

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return filesUnder(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

const sources = filesUnder(SRC).map(path => ({ path, rel: relative(SRC, path), text: readFileSync(path, "utf8") }))
const layerOf = (rel: string) => rel.split("/")[0]!

// import の行き先。相対なら web/src から見たフォルダ（core・store・ui・host）、そうでなければパッケージ名
function importsOf(file: { path: string; text: string }): string[] {
  const specs = [
    ...file.text.matchAll(/(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g),
  ].map(m => (m[1] ?? m[2])!)
  return specs.map(s => (s.startsWith(".") ? layerOf(relative(SRC, resolve(dirname(file.path), s))) : s))
}

// フォルダごとに読み込んでよいもの（フォルダの名前か、パッケージ名）
const ALLOWED: Record<string, (target: string) => boolean> = {
  core: t => t === "core" || t === "zod",
  store: t => t === "core" || t === "store" || t === "zustand/vanilla",
  ui: t =>
    ["core", "store", "ui", "react", "react-dom/client", "zustand", "zustand/react/shallow"].includes(t) ||
    t.endsWith(".css"),
}

describe("依存の向き", () => {
  for (const file of sources) {
    const layer = layerOf(file.rel)
    const allowed = ALLOWED[layer]
    if (!allowed) continue
    test(file.rel, () => {
      expect(importsOf(file).filter(t => !allowed(t))).toEqual([])
    })
  }
})

test("状態を変えるのは store の中だけ（画面は setState を使わない）", () => {
  const offenders = sources.filter(f => layerOf(f.rel) !== "store" && /\bsetState\b/.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
})

test("外の世界（通信・保存・URL・クリップボード）に触るのはホストの口だけ", () => {
  const host =
    /\bfetch\(|\blocalStorage\b|\bsessionStorage\b|\blocation\.|\bhistory\.|navigator\.clipboard|\bEventSource\b|\bWebSocket\b/
  const offenders = sources.filter(f => layerOf(f.rel) !== "host" && host.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
})

test("ソースに、その時の状況でしか意味を持たない言葉を書かない", () => {
  const words = /新基盤|オーバーホール|仮の|とりあえず|暫定/
  const files = [...sources, ...filesUnder(join(ROOT, "test")), ...filesUnder(join(ROOT, "e2e"))]
    .map(f => (typeof f === "string" ? { rel: relative(ROOT, f), text: readFileSync(f, "utf8") } : f))
    .filter(f => !f.rel.endsWith("rules.test.ts"))
  expect(files.filter(f => words.test(f.text)).map(f => f.rel)).toEqual([])
})
