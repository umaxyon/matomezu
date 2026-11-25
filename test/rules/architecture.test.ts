// 「構造とクレート」の決まりを見張る: クレートと Go のパッケージが読んでよいもの、状態を変える所、ホストとブラウザに触る所、error
import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import {
  ALLOWED,
  apiAllowed,
  baseAllowed,
  CRATES,
  crateOf,
  filesEnding,
  importsOf,
  inOwnCrate,
  isView,
  LIBRARY_READERS,
  pluginRoot,
  ROOT,
  ROOT_FILES,
  readsOf,
  relative,
  SRC,
  sources,
  topOf,
} from "./sources"

test("外のライブラリを読むファイルは、そのライブラリの型を書き出す物に出さない（matomezu の形に移して出す）", () => {
  const bad = Object.keys(LIBRARY_READERS).flatMap(rel => {
    const text = sources.find(f => f.rel === rel)!.text
    // そのライブラリから読み込んだ名前（import type * as X・import { a, b }）
    const names = [
      ...text.matchAll(/^import\s+(?:type\s+)?(?:\*\s+as\s+(\w+)|\{([^}]*)\})\s+from\s+["']([^"']+)["']/gm),
    ]
      .filter(m => LIBRARY_READERS[rel]!.includes(m[3]!))
      .flatMap(m =>
        m[1]
          ? [m[1]]
          : m[2]!.split(",").map(
              n =>
                n
                  .trim()
                  .split(/\s+as\s+/)
                  .pop()!,
            ),
      )
      .filter(n => n !== "")
    // 一番外の文（行の頭で始まる所ごと）のうち、書き出す物。関数は中身を除いた形（引数と返す型）だけを見る
    const exported = text
      .split(/\n(?=\S)/)
      .filter(st => st.startsWith("export"))
      .map(st => (st.startsWith("export function") ? st.slice(0, st.indexOf("{\n")) : st))
    return exported
      .filter(st => /\bimport\(/.test(st) || names.some(n => new RegExp(`\\b${n}\\b`).test(st)))
      .map(st => `${rel}: ${st.split("\n")[0]}`)
  })
  expect(bad).toEqual([])
})

test("web/src の直下は、決めたクレートとファイルだけ", () => {
  expect(readdirSync(SRC).sort()).toEqual([...CRATES, ...ROOT_FILES].sort())
})

describe("依存の向き", () => {
  for (const file of sources) {
    const crate = crateOf(file.rel)
    const targets = importsOf(file)
    const local = (t: string) =>
      ["core", "store", "ui", "plugins", "host-client", "engine"].includes(topOf(t)) && !t.endsWith(".css")
    if (crate === "plugins") {
      const own = pluginRoot(file.rel)
      const pluginAllowed = own === "plugins/base" ? baseAllowed : apiAllowed
      test(file.rel, () => {
        const bad = targets.filter(t => {
          if (t.endsWith(".css")) return !isView(file.rel)
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
    const allowed = ALLOWED[crate]
    if (!allowed) continue
    test(file.rel, () => {
      // 土台（core・store・ui）は、プラグインを読まない
      expect(targets.filter(t => !inOwnCrate(file.rel, t) && (local(t) ? !allowed(topOf(t)) : !allowed(t)))).toEqual([])
    })
  }
})

// プラグインの外（ホストのエンジン・testing・画面の入口）
const PLUGIN_OUTSIDERS = (rel: string) => ["engine", "testing"].includes(crateOf(rel)) || rel === "main.tsx"
test("プラグインの外が読むプラグインは、ビルトインの一覧と各プラグインの入口だけ（中のファイルは、そのプラグインが組み直してよい所）", () => {
  const entry = (t: string) =>
    t === "plugins" ||
    t === "plugins/ui" ||
    [pluginRoot(t), `${pluginRoot(t)}/index`, `${pluginRoot(t)}/ui`].includes(t)
  const bad = sources
    .filter(f => PLUGIN_OUTSIDERS(f.rel))
    .flatMap(f =>
      importsOf(f)
        .filter(t => topOf(t) === "plugins" && !entry(t))
        .map(t => `${f.rel} → ${t}`),
    )
  expect(bad).toEqual([])
})

test("画面の入口（main.tsx）が読むのは、土台・host-client・ビルトインの一覧・plugin-modules の画面用・React だけ", () => {
  const ok = (t: string) =>
    ["core", "store", "ui", "host-client"].includes(topOf(t)) ||
    ["plugins", "plugins/ui", "plugin-modules/ui", "react", "react-dom/client"].includes(t)
  const main = sources.find(f => f.rel === "main.tsx")!
  expect(importsOf(main).filter(t => !ok(t))).toEqual([])
})

test("状態を変えるのは store の中だけ（画面は setState を使わない）", () => {
  const offenders = sources.filter(f => crateOf(f.rel) !== "store" && /\bsetState\b/.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
})

test("土台（core・store・ui）は、プラグインの物を id で名指さない", () => {
  const offenders = sources
    .filter(f => ["core", "store", "ui"].includes(crateOf(f.rel)))
    .flatMap(f =>
      [...f.text.replace(/\/\/.*$/gm, "").matchAll(/["'`](@matomezu\/[^"'`]*)["'`]/g)].map(m => `${f.rel}: ${m[1]}`),
    )
  expect(offenders).toEqual([])
})

test("ホストとブラウザ（通信・保存・URL・クリップボード・印刷）に触るのはホストクライアントだけ", () => {
  const host =
    /\bfetch\(|\blocalStorage\b|\bsessionStorage\b|\blocation\.|\bhistory\.|navigator\.clipboard|\bEventSource\b|\bWebSocket\b|\bwindow\.print\b/
  const offenders = sources.filter(f => crateOf(f.rel) !== "host-client" && host.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
})

test("error は error の表（core/errors.ts）の番号で投げる（ほかで Error を作らない）", () => {
  const offenders = sources.filter(f => f.rel !== "core/errors.ts" && /\bnew Error\(/.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
})

test("プラグイン状態の宣言（kit.definePluginState・definePluginStateOf）は、書いたものがすべて、ビルトインプラグインの pluginStates に載っている", async () => {
  const { BUILTIN } = await import("../../web/src/plugins")
  const { createMatomezu } = await import("../../web/src/store/create")
  const written = sources
    .filter(f => crateOf(f.rel) === "plugins")
    .map(f => f.text.match(/\bkit\.definePluginState(?:Of\b<[^()]*>\(\))?\(/g)?.length ?? 0)
    .reduce((a, b) => a + b, 0)
  const instance = createMatomezu({ plugins: BUILTIN, controlCenter: BUILTIN_CONTROL_CENTER })
  // 鍵ごとに宣言を作る関数（anchorTargetState）は 1 つの書き方で、呼ぶ所ごとに宣言が 1 つ増える
  expect(instance.catalog.store.pluginStates.size).toBe(written)
})

// 外に見せる入口: プラグイン API の入口（plugin-entry/。matomezu は React なしの定義の口、matomezu/ui は見た目を結ぶ口）と、
// テストで組む入口（testing/。matomezu/testing）。中のコードは入口を読まない（入口が中を読む向きだけ）
const ENTRY_CRATES = ["plugin-entry", "testing"]
const ENTRY_ALLOWED: Record<string, (target: string) => boolean> = {
  // zod と base の置く計算・文字、base の公開する共通の処理（utils）も出し直す。plugins と plugins/ui は、ビルトインの型の書き足しを含めるための型だけの読み込み
  "plugin-entry/index.ts": t =>
    t === "plugin-api" || t === "zod" || t === "plugins/base" || t === "plugins/base/utils" || t === "plugins",
  "plugin-entry/ui.ts": t =>
    t === "plugin-api/ui" || t === "plugins/base/ui" || t === "plugins/base/utils/ui" || t === "plugins/ui",
  "testing/index.ts": t => ["core", "store", "ui"].includes(topOf(t)) || t === "plugins" || t === "plugins/ui",
}

test("プラグイン API の入口は、ビルトインの一覧（plugins・plugins/ui）を型だけ読む（値で読むと、ビルトインの全部が入口に入る）", () => {
  const bad = sources
    .filter(f => f.rel.startsWith("plugin-entry/"))
    .flatMap(f =>
      readsOf(f.text)
        .filter(r => !r.typeOnly && ["plugins", "plugins/ui"].includes(relative(SRC, resolve(dirname(f.path), r.spec))))
        .map(r => `${f.rel} → ${r.spec}`),
    )
  expect(bad).toEqual([])
})

test("外に見せる入口は、決めたクレートだけを読み、中のコードは入口を読まない", () => {
  const entries = sources.filter(f => ENTRY_CRATES.includes(crateOf(f.rel)))
  expect(entries.map(f => f.rel).sort()).toEqual(Object.keys(ENTRY_ALLOWED).sort())
  const bad = entries.flatMap(f =>
    importsOf(f)
      .filter(t => !ENTRY_ALLOWED[f.rel]!(t))
      .map(t => `${f.rel} → ${t}`),
  )
  const inward = sources
    .filter(f => !ENTRY_CRATES.includes(crateOf(f.rel)) && crateOf(f.rel) !== "plugin-modules")
    .flatMap(f =>
      importsOf(f)
        .filter(t => ENTRY_CRATES.includes(topOf(t)))
        .map(t => `${f.rel} → ${t}`),
    )
  expect([...bad, ...inward]).toEqual([])
})

// プラグイン API のクレート（plugin-api/）: index は core・store だけ、ui は ui だけを読み、名前を出し直すだけ（ほかのことを書かない）
test("プラグイン API のクレートは、index が core と store、ui が ui、builtin が store だけから名前を出し直す", () => {
  const api = sources.filter(f => crateOf(f.rel) === "plugin-api")
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
  const own = sources.filter(f => crateOf(f.rel) === "plugin-modules")
  const bad = own.flatMap(f =>
    importsOf(f)
      .filter(t => !MODULES_ALLOWED.includes(t === "plugin-entry/index" ? "plugin-entry" : t))
      .map(t => `${f.rel} → ${t}`),
  )
  const readers = sources
    .filter(f => crateOf(f.rel) !== "plugin-modules" && !MODULES_READERS.includes(f.rel))
    .flatMap(f =>
      importsOf(f)
        .filter(t => topOf(t) === "plugin-modules")
        .map(t => `${f.rel} → ${t}`),
    )
  expect(own.length).toBeGreaterThan(0)
  expect([...bad, ...readers]).toEqual([])
})

// 土台に、プラグインしか使わない処理を置かない（プラグインだけが使う物は base が持つ）。プラグイン API が出し直すだけの物も、土台の中で使っていなければ当たる。
// ui はプラグインが使う画面の口なので、プラグインからだけ読まれてよい
test("core と store のモジュールで、プラグインとプラグイン API しか読んでいない物は無い", () => {
  const readers = new Map<string, Set<string>>()
  for (const f of sources)
    for (const t of importsOf(f)) {
      const key = t.replace(/\/index$/, "")
      readers.set(key, (readers.get(key) ?? new Set()).add(crateOf(f.rel)))
    }
  const pluginsOnly = sources
    .filter(f => crateOf(f.rel) === "core" || crateOf(f.rel) === "store")
    .map(f => f.rel.replace(/\.tsx?$/, ""))
    .filter(m => {
      const by = [...(readers.get(m) ?? [])]
      return by.length > 0 && by.every(l => l === "plugins" || l === "plugin-api" || l === "plugin-entry")
    })
  expect(pluginsOnly).toEqual([])
})

// 値で読む先（web/src のファイル）。型だけの読み込み（import type・export type・名前が全部 type 付きの import）は数えず、
// export * from・export { x } from・副作用だけの import は値に数える
function valueReadsOf(file: { path: string; text: string }): string[] {
  const reads = [
    ...file.text.matchAll(/^(import|export)\s+([^"';]*?)\s*from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm),
  ].flatMap(m => {
    const spec = (m[3] ?? m[4])!
    const clause = m[2]?.trim() ?? ""
    const named = /^\{([^}]*)\}$/.exec(clause)?.[1]
    const names =
      named
        ?.split(",")
        .map(n => n.trim())
        .filter(n => n !== "") ?? []
    const typeOnly =
      /^type\b/.test(clause) || (m[1] === "import" && names.length > 0 && names.every(n => /^type\b/.test(n)))
    return typeOnly || !spec.startsWith(".") || spec.endsWith(".css") ? [] : [resolve(dirname(file.path), spec)]
  })
  return reads.flatMap(p => {
    const found = [`${p}.ts`, `${p}.tsx`, join(p, "index.ts"), join(p, "index.tsx")].find(f => existsSync(f))
    return found ? [relative(SRC, found)] : []
  })
}

test("web/src のファイルどうしは、値で読む輪を作らない（型だけ読むのは除く）", () => {
  const graph = new Map(sources.map(f => [f.rel, valueReadsOf(f)]))
  // 強連結成分（Tarjan）で、2 つ以上のファイルの輪と、自分を読むファイルを探す
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const rings: string[][] = []
  const visit = (v: string) => {
    index.set(v, index.size)
    low.set(v, index.get(v)!)
    stack.push(v)
    onStack.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
    }
    if (low.get(v) !== index.get(v)) return
    const ring: string[] = []
    for (let w = stack.pop()!; ; w = stack.pop()!) {
      onStack.delete(w)
      ring.push(w)
      if (w === v) break
    }
    if (ring.length > 1 || graph.get(v)?.includes(v)) rings.push(ring.sort())
  }
  for (const v of graph.keys()) if (!index.has(v)) visit(v)
  expect(rings).toEqual([])
})

// Go のパッケージ（conventions/architecture.md の「Go のパッケージ」）: internal/ のパッケージは、決めたパッケージだけを読む（テストのファイルは除く）
const GO_ALLOWED: Record<string, readonly string[]> = {
  storage: [],
  plugin: [],
  engine: ["plugin"],
  server: ["aiwire", "engine", "peer", "plugin", "storage"],
  mcp: ["aiwire"],
  home: [],
  browser: [],
  aiwire: [],
  peer: [],
}

test("Go のパッケージは internal の下と、実行ファイルの入口（cmd/matomezu）と埋め込みの画面（web）と、AI のプログラムと ADE ごとの部品（clients/<AI の名前>・clients/ade/<ADE の名前>）だけ。web と clients は matomezu のほかのパッケージを読まず、clients を読むのは cmd/matomezu だけ", () => {
  const tops = readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith(".") && !["node_modules", "internal"].includes(e.name))
    .map(e => e.name)
  const outside = [
    ...new Set(tops.flatMap(d => filesEnding(join(ROOT, d), ".go")).map(f => relative(ROOT, dirname(f)))),
  ].sort()
  expect(outside.filter(d => !d.startsWith("clients/"))).toEqual(["cmd/matomezu", "web"])
  const own = /"github\.com\/umaxyon\/matomezu\//
  const bad = [...filesEnding(join(ROOT, "web"), ".go"), ...filesEnding(join(ROOT, "clients"), ".go")].filter(f =>
    own.test(readFileSync(f, "utf8")),
  )
  expect(bad).toEqual([])
  const readsClients = filesEnding(join(ROOT, "internal"), ".go").filter(f =>
    /"github\.com\/umaxyon\/matomezu\/clients\//.test(readFileSync(f, "utf8")),
  )
  expect(readsClients).toEqual([])
})

test("Go の internal のパッケージは、決めたパッケージだけを読む", () => {
  const internal = join(ROOT, "internal")
  const packages = readdirSync(internal).filter(d => statSync(join(internal, d)).isDirectory())
  expect(packages.sort()).toEqual(Object.keys(GO_ALLOWED).sort())
  const bad = packages.flatMap(pkg =>
    readdirSync(join(internal, pkg))
      .filter(f => f.endsWith(".go") && !f.endsWith("_test.go"))
      .flatMap(f =>
        [...readFileSync(join(internal, pkg, f), "utf8").matchAll(/"github\.com\/umaxyon\/matomezu\/internal\/(\w+)"/g)]
          .map(m => m[1]!)
          .filter(dep => !GO_ALLOWED[pkg]!.includes(dep))
          .map(dep => `${pkg}/${f} → ${dep}`),
      ),
  )
  expect(bad).toEqual([])
})

// MCP とホストの AI の口のヘッダの名前は aiwire にだけ書く（テストのファイルは、送る・返る値として直に書いてよい）
test("Go のヘッダの名前（X-Matomezu-）の文字は、aiwire の外に書かない", () => {
  const bad = [...filesEnding(join(ROOT, "internal"), ".go"), ...filesEnding(join(ROOT, "cmd"), ".go")]
    .filter(f => !f.endsWith("_test.go") && !relative(ROOT, f).startsWith("internal/aiwire/"))
    .filter(f => /"X-Matomezu-/.test(readFileSync(f, "utf8")))
    .map(f => relative(ROOT, f))
  expect(bad).toEqual([])
})

// 常駐の入口は、合言葉（auth・ai）か、画面 cookie を持つブラウザだけ（screen）。画面からの入口を sameOrigin だけで包むと、AI が画面の入口を使える抜け道になる（conventions/architecture.md「ホストとブラウザとのやり取り」）
test("Go の常駐の入口（server.go の mux.Handle）は、auth・ai・screen のどれかで包む", () => {
  const text = readFileSync(join(ROOT, "internal/server/server.go"), "utf8")
  const routes = [...text.matchAll(/mux\.Handle\("([^"]*)",\s*(.*)$/gm)].map(m => ({
    path: m[1]!,
    handler: m[2]!,
  }))
  expect(routes.length).toBeGreaterThan(10)
  const open = new Set(["GET /cookie", "/api/", "/"])
  const bad = routes.filter(r => !open.has(r.path) && !/^o\.(auth|ai|screen)\(/.test(r.handler)).map(r => r.path)
  expect(bad).toEqual([])
})

// ホストどうしの入口は、ペアリングしたホストだけを通す（peer.Pinned）か、鍵を知らない相手も通す（peer.Unpinned）。Unpinned はペアリングの頼みの口 1 つだけ
test("Go のホストどうしの入口（hosts_routes.go の mux.Handle）は、peer.Pinned か peer.Unpinned で包み、Unpinned はペアリングの頼みの口だけ", () => {
  const text = readFileSync(join(ROOT, "internal/server/hosts_routes.go"), "utf8")
  const routes = [...text.matchAll(/mux\.Handle(?:Func)?\("([^"]*)",\s*(.*)$/gm)].map(m => ({
    path: m[1]!,
    handler: m[2]!,
  }))
  expect(routes.length).toBeGreaterThan(0)
  expect(routes.filter(r => !/^peer\.(Pinned|Unpinned)\(/.test(r.handler)).map(r => r.path)).toEqual([])
  expect(routes.filter(r => /^peer\.Unpinned\(/.test(r.handler)).map(r => r.path)).toEqual(["POST /peer/v1/pairing"])
})
