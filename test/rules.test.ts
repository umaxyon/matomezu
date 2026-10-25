// 構造の決まりを見張る: フォルダごとに読み込んでよいもの、状態を変える入口、外の世界に触る所、コメントの言葉
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"

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

// import の行き先。相対なら web/src から見たパス（拡張子なし）、そうでなければパッケージ名
function importsOf(file: { path: string; text: string }): string[] {
  const specs = [
    ...file.text.matchAll(/(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g),
  ].map(m => (m[1] ?? m[2])!)
  return specs.map(s => (s.startsWith(".") ? relative(SRC, resolve(dirname(file.path), s)) : s))
}
const topOf = (t: string) => t.split("/")[0]!

// フォルダごとに読み込んでよいもの（土台のフォルダの名前か、パッケージ名）
const ALLOWED: Record<string, (target: string) => boolean> = {
  core: t => t === "core" || t === "zod",
  store: t => t === "core" || t === "store" || t === "zustand/vanilla",
  host: t => t === "core" || t === "store" || t === "host" || t === "zod",
  engine: t => t === "core" || t === "store" || t === "plugins" || t === "zod",
  ui: t =>
    ["core", "store", "ui", "react", "react-dom", "react-dom/client", "zustand", "zustand/react/shallow"].includes(t) ||
    t.endsWith(".css"),
}
// プラグインのファイルは役割で見る。見た目（.tsx と ui.ts）は ui と同じもの、ほかは core・store・zod だけ
const isView = (rel: string) => rel.endsWith(".tsx") || basename(rel) === "ui.ts"
// プラグインのフォルダ: plugins/名前。ブックのタイプのプラグインは plugins/books/名前、アイテムのプラグインは plugins/items/名前
const pluginRoot = (rel: string) => {
  const parts = rel.split("/")
  return parts.slice(0, parts[1] === "books" || parts[1] === "items" ? 3 : 2).join("/")
}
const pluginAllowed = (rel: string) => (t: string) =>
  isView(rel) ? ALLOWED.ui!(t) : t === "core" || t === "store" || t === "zod"

describe("依存の向き", () => {
  for (const file of sources) {
    const layer = layerOf(file.rel)
    const targets = importsOf(file)
    const local = (t: string) =>
      ["core", "store", "ui", "plugins", "host", "engine"].includes(topOf(t)) && !t.endsWith(".css")
    if (layer === "plugins") {
      const own = pluginRoot(file.rel)
      test(file.rel, () => {
        const bad = targets.filter(t => {
          if (t.endsWith(".css")) return !isView(file.rel)
          if (!local(t)) return !pluginAllowed(file.rel)(t)
          if (topOf(t) !== "plugins") return !pluginAllowed(file.rel)(topOf(t))
          // 同じプラグインの中（下のフォルダも含む）か、土台のプラグイン base の入口（index・ui）だけ。見た目でないファイルは見た目を読まない
          const root = pluginRoot(t)
          const isEntry = t === root || t === `${root}/index` || t === `${root}/ui`
          // 中の部品の一覧（plugins/index.ts・plugins/ui.ts）は、どのプラグインの入口も読む
          const assembly = file.rel === "plugins/index.ts" || file.rel === "plugins/ui.ts"
          const entry = isEntry && (root === "plugins/base" || assembly)
          if (t !== own && !t.startsWith(`${own}/`) && !entry) return true
          const targetIsView = basename(t) === "ui" || sources.some(f => f.rel === `${t}.tsx`)
          return !isView(file.rel) && targetIsView
        })
        expect(bad).toEqual([])
      })
      continue
    }
    const allowed = ALLOWED[layer]
    if (!allowed) continue
    test(file.rel, () => {
      // 土台（core・store・ui）は、プラグインを読まない
      expect(targets.filter(t => (local(t) ? !allowed(topOf(t)) : !allowed(t)))).toEqual([])
    })
  }
})

test("ブックのタイプの名前で振る舞いを分けない（使えるかは、タイプが選んだものと宣言で決める）", () => {
  const bookTypeIs = /\b(?:book|ctx\.book|opened|stage\.opened)\??\.type\s*[!=]==\s*["']/
  const offenders = sources.filter(f => bookTypeIs.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
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

test("誤りは誤りの表（core/errors.ts）の番号で投げる（ほかで Error を作らない）", () => {
  const offenders = sources.filter(f => f.rel !== "core/errors.ts" && /\bnew Error\(/.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
})

test("ソースに、その時の状況でしか意味を持たない言葉を書かない", () => {
  const words = /新基盤|オーバーホール|仮の|とりあえず|暫定|旧版|前の作り/
  const files = [...sources, ...filesUnder(join(ROOT, "test")), ...filesUnder(join(ROOT, "e2e"))]
    .map(f => (typeof f === "string" ? { rel: relative(ROOT, f), text: readFileSync(f, "utf8") } : f))
    .filter(f => !f.rel.endsWith("rules.test.ts"))
  expect(files.filter(f => words.test(f.text)).map(f => f.rel)).toEqual([])
})

test("core のデータと同じ名前の画面の部品は作らない（データ X のビューは XView）", () => {
  const dataNames = new Set(
    sources
      .filter(f => layerOf(f.rel) === "core")
      .map(f =>
        basename(f.rel)
          .replace(/\.tsx?$/, "")
          .toLowerCase(),
      ),
  )
  const views = sources.filter(f => (layerOf(f.rel) === "ui" || layerOf(f.rel) === "plugins") && f.rel.endsWith(".tsx"))
  const clashes = views.filter(f => dataNames.has(basename(f.rel, ".tsx").toLowerCase())).map(f => f.rel)
  expect(clashes).toEqual([])
})

// Def の title は文言の表の鍵（MessageKey の型が確かめる）なので除く
test("画面の文言は t() を通す（ui に日本語を直に書かない）", () => {
  const japanese = /[\u3040-\u30ff\u3400-\u9fff]/
  const offenders = sources
    .filter(f => layerOf(f.rel) === "ui" || (layerOf(f.rel) === "plugins" && f.rel.endsWith(".tsx")))
    .flatMap(f =>
      f.text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line, i) => ({
          line: line
            .replace(/\/\/.*$/, "")
            .replace(/\bt\("[^"]*"/g, "")
            .replace(/^\s*title: "[^"]*"/, ""),
          at: `${f.rel}:${i + 1}`,
        }))
        .filter(l => japanese.test(l.line))
        .map(l => l.at),
    )
  expect(offenders).toEqual([])
})

// 外に見せる入口: プラグイン API（plugin-api/。matomezu は React なしの定義の口、matomezu/ui は見た目を結ぶ口）と、
// テストで組む入口（testing/。matomezu/testing）。中のコードは入口を読まない（入口が中を読む向きだけ）
const ENTRY_LAYERS = ["plugin-api", "testing"]
const ENTRY_ALLOWED: Record<string, (target: string) => boolean> = {
  "plugin-api/index.ts": t => ["core", "store"].includes(topOf(t)),
  "plugin-api/ui.ts": t => topOf(t) === "ui" || t === "plugins/base/ui",
  "testing/index.ts": t =>
    ["store", "ui"].includes(topOf(t)) || t === "plugins" || t === "plugins/ui" || t === "sample-books",
}

test("外に見せる入口は、決めた層だけを読み、中のコードは入口を読まない", () => {
  const entries = sources.filter(f => ENTRY_LAYERS.includes(layerOf(f.rel)))
  expect(entries.map(f => f.rel).sort()).toEqual(Object.keys(ENTRY_ALLOWED).sort())
  const bad = entries.flatMap(f =>
    importsOf(f)
      .filter(t => !ENTRY_ALLOWED[f.rel]!(t))
      .map(t => `${f.rel} → ${t}`),
  )
  const inward = sources
    .filter(f => !ENTRY_LAYERS.includes(layerOf(f.rel)))
    .flatMap(f =>
      importsOf(f)
        .filter(t => ENTRY_LAYERS.includes(topOf(t)))
        .map(t => `${f.rel} → ${t}`),
    )
  expect([...bad, ...inward]).toEqual([])
})

// 外のプラグインと、それを組むアプリの見本（test/examples）: 中（web/src）を直に読まず、プラグイン API の名前（アプリのテストは matomezu/testing も）だけを読む。
// プラグイン（plugins/名前）は互いに読まない。見た目でないファイルは matomezu/ui も React も読まない。アプリはプラグインの入口（index・ui）を読む
const EXAMPLES = join(ROOT, "test/examples")
const examples = filesUnder(EXAMPLES).map(path => ({
  path,
  rel: relative(EXAMPLES, path),
  text: readFileSync(path, "utf8"),
}))
const specsOf = (text: string) =>
  [...text.matchAll(/(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g)].map(
    m => (m[1] ?? m[2])!,
  )

test("見本はプラグイン API の名前だけを読み、プラグインどうしは読まない", () => {
  const bad = examples.flatMap(f => {
    const parts = f.rel.split("/")
    const isPlugin = parts[0] === "plugins"
    const own = isPlugin ? parts.slice(0, 2).join("/") : parts[0]!
    const view = isView(f.rel)
    return specsOf(f.text)
      .filter(s => {
        if (s.startsWith(".")) {
          const target = relative(EXAMPLES, resolve(dirname(f.path), s))
          if (target === own || target.startsWith(`${own}/`)) return s.endsWith(".css") && !view
          if (isPlugin) return true
          const [top, name, ...rest] = target.split("/")
          return top !== "plugins" || !name || !(rest.length === 0 || ["index", "ui"].includes(rest.join("/")))
        }
        const always = ["matomezu", "matomezu/tables", "zod"]
        const forViews = ["matomezu/ui", "react"]
        const forApps = ["matomezu/testing", "bun:test", "@testing-library/react"]
        if (always.includes(s)) return false
        if (forViews.includes(s)) return !view && isPlugin
        return isPlugin || !forApps.includes(s)
      })
      .map(s => `${f.rel} → ${s}`)
  })
  expect(bad).toEqual([])
})
