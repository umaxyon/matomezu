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
  "host-client": t => t === "core" || t === "store" || t === "host-client" || t === "zod",
  engine: t => t === "core" || t === "store" || t === "plugins" || t === "plugin-modules" || t === "zod",
  ui: t =>
    ["core", "store", "ui", "react", "react-dom", "react-dom/client", "zustand", "zustand/react/shallow"].includes(t) ||
    t.endsWith(".css"),
  // プラグイン API は土台から名前を出し直すだけ（index は core・store、ui は ui。下の「プラグイン API の層」で分けて見る）。プラグインは読まない
  "plugin-api": t => t === "core" || t === "store" || t === "ui",
}
// プラグインのファイルは役割で見る。見た目（.tsx と ui.ts）は ui と同じもの、ほかは core・store・zod だけ
const isView = (rel: string) => rel.endsWith(".tsx") || basename(rel) === "ui.ts"
// プラグインのフォルダ: plugins/名前。ブックのタイプのプラグインは plugins/books/名前、アイテムのプラグインは plugins/items/名前
const pluginRoot = (rel: string) => {
  const parts = rel.split("/")
  return parts.slice(0, parts[1] === "books" || parts[1] === "items" ? 3 : 2).join("/")
}
// base は土台を直に読む（プラグイン API の部品を作る側）。プラグイン API は読まない（plugin-api が base を読まないのと合わせて、輪を作らない）
const baseAllowed = (rel: string) => (t: string) =>
  isView(rel) ? ALLOWED.ui!(t) : t === "core" || t === "store" || t === "zod"
// base 以外のビルトインプラグインは、プラグイン API と zod だけ（見た目は plugin-api/ui と React も）。状態は plugin-api/ui のフックで読む
const apiAllowed = (rel: string) => (t: string) =>
  t === "plugin-api" ||
  t === "plugin-api/builtin" ||
  t === "zod" ||
  (isView(rel) && ["plugin-api/ui", "react", "react-dom"].includes(t))

describe("依存の向き", () => {
  for (const file of sources) {
    const layer = layerOf(file.rel)
    const targets = importsOf(file)
    const local = (t: string) =>
      ["core", "store", "ui", "plugins", "host-client", "engine"].includes(topOf(t)) && !t.endsWith(".css")
    if (layer === "plugins") {
      const own = pluginRoot(file.rel)
      const pluginAllowed = own === "plugins/base" ? baseAllowed : apiAllowed
      test(file.rel, () => {
        const bad = targets.filter(t => {
          if (t.endsWith(".css")) return !isView(file.rel)
          if (
            ["ui/store-context", "plugin-api", "plugin-api/ui", "plugin-api/builtin"].includes(t) &&
            own !== "plugins/base"
          )
            return !pluginAllowed(file.rel)(t)
          if (!local(t)) return !pluginAllowed(file.rel)(t)
          if (topOf(t) !== "plugins") return !pluginAllowed(file.rel)(topOf(t))
          // 同じプラグインの中（下のフォルダも含む）か、base の入口（index・ui）だけ。見た目でないファイルは見た目を読まない
          const root = pluginRoot(t)
          const isEntry = t === root || t === `${root}/index` || t === `${root}/ui`
          // ビルトインプラグインの一覧（plugins/index.ts・plugins/ui.ts）は、どのプラグインの入口も読む
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

test("外の世界（通信・保存・URL・クリップボード）に触るのはホストクライアントだけ", () => {
  const host =
    /\bfetch\(|\blocalStorage\b|\bsessionStorage\b|\blocation\.|\bhistory\.|navigator\.clipboard|\bEventSource\b|\bWebSocket\b/
  const offenders = sources.filter(f => layerOf(f.rel) !== "host-client" && host.test(f.text)).map(f => f.rel)
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

test("core のデータと同じ名前のコンポーネントは作らない（データ X のビューは XView）", () => {
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

// 外に見せる入口: プラグイン API の入口（plugin-entry/。matomezu は React なしの定義の口、matomezu/ui は見た目を結ぶ口）と、
// テストで組む入口（testing/。matomezu/testing）。中のコードは入口を読まない（入口が中を読む向きだけ）
const ENTRY_LAYERS = ["plugin-entry", "testing"]
const ENTRY_ALLOWED: Record<string, (target: string) => boolean> = {
  // zod と base の置く計算・文字も出し直す。plugins と plugins/ui は、ビルトインの型の書き足しを含めるための型だけの読み込み
  "plugin-entry/index.ts": t => t === "plugin-api" || t === "zod" || t === "plugins/base" || t === "plugins",
  "plugin-entry/ui.ts": t => t === "plugin-api/ui" || t === "plugins/base/ui" || t === "plugins/ui",
  "testing/index.ts": t => ["store", "ui"].includes(topOf(t)) || t === "plugins" || t === "plugins/ui",
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
    .filter(f => !ENTRY_LAYERS.includes(layerOf(f.rel)) && layerOf(f.rel) !== "plugin-modules")
    .flatMap(f =>
      importsOf(f)
        .filter(t => ENTRY_LAYERS.includes(topOf(t)))
        .map(t => `${f.rel} → ${t}`),
    )
  expect([...bad, ...inward]).toEqual([])
})

// プラグイン API の層（plugin-api/）: index は core・store だけ、ui は ui だけを読み、名前を出し直すだけ（ほかのことを書かない）
test("プラグイン API の層は、index が core と store、ui が ui、builtin が store だけから名前を出し直す", () => {
  const api = sources.filter(f => layerOf(f.rel) === "plugin-api")
  expect(api.map(f => f.rel).sort()).toEqual(["plugin-api/builtin.ts", "plugin-api/index.ts", "plugin-api/ui.ts"])
  const bad = api.flatMap(f => {
    const ok = f.rel === "plugin-api/ui.ts" ? ["ui"] : f.rel === "plugin-api/builtin.ts" ? ["store"] : ["core", "store"]
    const code = f.text
      .replace(/\/\/.*$/gm, "")
      .replace(/export\s+(type\s+)?\{[^}]*\}\s+from\s+"[^"]+"/g, "")
      .trim()
    return [
      ...importsOf(f)
        .filter(t => !ok.includes(topOf(t)))
        .map(t => `${f.rel} → ${t}`),
      ...(code ? [`${f.rel}: ${code.slice(0, 40)}`] : []),
    ]
  })
  expect(bad).toEqual([])
})

// 追加プラグインが借りる、名前から実物を引く表（plugin-modules/）: プラグイン API の入口を読んでよいのはここだけで、ここを読んでよいのはホストのエンジンと画面の入口だけ
const MODULES_ALLOWED = ["plugin-entry", "plugin-entry/ui", "plugin-modules", "react", "react/jsx-runtime"]
const MODULES_READERS = ["engine/engine.ts", "main.tsx"]

test("plugin-modules は入口と React だけを読み、ホストのエンジンと画面の入口だけが読む", () => {
  const own = sources.filter(f => layerOf(f.rel) === "plugin-modules")
  const bad = own.flatMap(f =>
    importsOf(f)
      .filter(t => !MODULES_ALLOWED.includes(t === "plugin-entry/index" ? "plugin-entry" : t))
      .map(t => `${f.rel} → ${t}`),
  )
  const readers = sources
    .filter(f => layerOf(f.rel) !== "plugin-modules" && !MODULES_READERS.includes(f.rel))
    .flatMap(f =>
      importsOf(f)
        .filter(t => topOf(t) === "plugin-modules")
        .map(t => `${f.rel} → ${t}`),
    )
  expect(own.length).toBeGreaterThan(0)
  expect([...bad, ...readers]).toEqual([])
})

// 追加プラグインの見本（test/added-plugins/exN。それぞれ開発者プロジェクトの形）: 中（web/src）を直に読まず、プラグイン API の名前だけを読む。
// 見本どうしは読まない。見た目でないファイルは matomezu/ui も React も読まない。テスト（test/）は matomezu/testing と、自分のプラグインのファイルも読む
const ADDED = join(ROOT, "test/added-plugins")
const added = filesUnder(ADDED)
  .filter(path => /\.tsx?$/.test(path))
  .map(path => ({ path, rel: relative(ADDED, path), text: readFileSync(path, "utf8") }))
const specsOf = (text: string) =>
  [...text.matchAll(/(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g)].map(
    m => (m[1] ?? m[2])!,
  )

test("追加プラグインの見本はプラグイン API の名前だけを読み、見本どうしは読まない", () => {
  expect(added.length).toBeGreaterThan(0)
  const bad = added.flatMap(f => {
    const [own, ...rest] = f.rel.split("/")
    const isTest = rest[0] === "test"
    const view = isView(f.rel) && !isTest
    return specsOf(f.text)
      .filter(s => {
        if (s.startsWith(".")) {
          const target = relative(ADDED, resolve(dirname(f.path), s))
          if (target.split("/")[0] !== own) return true
          return s.endsWith(".css") && !view
        }
        const always = ["matomezu", "matomezu/catalog"] // zod も matomezu から読む
        const forViews = ["matomezu/ui", "react"]
        const forTests = ["matomezu/testing", "matomezu/ui", "bun:test", "@testing-library/react"]
        if (always.includes(s)) return false
        if (isTest) return !forTests.includes(s)
        return !(forViews.includes(s) && view)
      })
      .map(s => `${f.rel} → ${s}`)
  })
  expect(bad).toEqual([])
})

test("アクションは同じ入力なら同じ結果: アクションを定義するファイルは時刻と乱数を直に使わない（ctx.now と ctx.newId を使う）", () => {
  const defining = [...sources, ...added].filter(
    f => /\bdefineAction\s*\(/.test(f.text) && !f.path.endsWith("def/action.ts"),
  )
  expect(defining.length).toBeGreaterThan(0)
  const bad = defining
    .filter(f => /\bDate\b|\bMath\.random\b|\bcrypto\.|\bperformance\.now\b/.test(f.text.replace(/\/\/.*$/gm, "")))
    .map(f => relative(ROOT, f.path))
  expect(bad).toEqual([])
})

// 土台に、プラグインしか使わない処理を置かない（プラグインだけが使う物は base が持つ）。プラグイン API が出し直すだけの物も、土台の中で使っていなければ当たる
test("core のモジュールで、プラグインとプラグイン API しか読んでいない物は無い", () => {
  const readers = new Map<string, Set<string>>()
  for (const f of sources)
    for (const t of importsOf(f)) {
      const key = t.replace(/\/index$/, "")
      readers.set(key, (readers.get(key) ?? new Set()).add(layerOf(f.rel)))
    }
  const pluginsOnly = sources
    .filter(f => layerOf(f.rel) === "core")
    .map(f => f.rel.replace(/\.tsx?$/, ""))
    .filter(m => {
      const by = [...(readers.get(m) ?? [])]
      return by.length > 0 && by.every(l => l === "plugins" || l === "plugin-api" || l === "plugin-entry")
    })
  expect(pluginsOnly).toEqual([])
})

// ページを替えるのは土台の putPage だけ。プラグイン（ビルトインと見本）はブックを { ...book, pages } で組み直さない（新しいブックを作る create の pages: [] は除く）
test("プラグインはブックのページを { ...book, pages } で組み直さない（putPage を使う）", () => {
  const rebuild = /\.\.\.\s*\w+\s*,\s*pages\s*(?:[,}]|:(?!\s*\[\s*\]))/
  const offenders = [...sources.filter(f => layerOf(f.rel) === "plugins"), ...added]
    .filter(f => rebuild.test(f.text))
    .map(f => f.rel)
  expect(offenders).toEqual([])
})
