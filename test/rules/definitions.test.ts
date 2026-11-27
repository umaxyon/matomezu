// 「定義と機能台帳」の決まりを見張る: 参照の向き、テーマ、ページのタイプ、アクション、拡張ポイント、id
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { basename, join } from "node:path"
import {
  ADDED,
  added,
  crateOf,
  isView,
  pluginRoot,
  plugins,
  ROOT,
  relative,
  SRC,
  sources,
  specOwner,
  specs,
  withoutDeclareModule,
} from "./sources"

test("ページのタイプの名前で振る舞いを分けない（使えるかは、タイプが選んだものと宣言で決める）", () => {
  const pageTypeIs = /\b(?:book|ctx\.book|opened|stage\.opened)\??\.type\s*[!=]==\s*["']/
  const offenders = sources.filter(f => pageTypeIs.test(f.text)).map(f => f.rel)
  expect(offenders).toEqual([])
})

test("テーマの値を引く関数（resolveTokens・bookTokens）を読むのは見た目のファイルだけ（データを変える処理と並べ方の計算は、テーマで変わる値を使わない）。機能台帳のテーマを直に読む所は見張れない", () => {
  // 関数を書く所（base の book-look/tokens.ts と look.ts）のほかは、どのクレートも見る。出し直し（export … from）は読んだことにしない
  const readsTheme = /\bimport\s*\{[^}]*\b(?:resolveTokens|bookTokens)\b[^}]*\}/
  const offenders = sources
    .filter(
      f => !isView(f.rel) && !["plugins/base/book-look/tokens.ts", "plugins/base/book-look/look.ts"].includes(f.rel),
    )
    .filter(f => readsTheme.test(f.text))
    .map(f => f.rel)
  expect(offenders).toEqual([])
})

test("ページのタイプの slide.allowed に書くのは、ケイパビリティ @matomezu/slide:on-slide を持つ形だけ", async () => {
  const { CORE_CATALOG } = await import("../support")
  const others = [...CORE_CATALOG.pageTypes.values()].flatMap(t =>
    (t.slide?.allowed ?? [])
      .filter(id => !CORE_CATALOG.items.get(id)?.capabilities.includes("@matomezu/slide:on-slide"))
      .map(id => `${t.id}: ${id}`),
  )
  expect(others).toEqual([])
})

test("アクションは同じ入力なら同じ結果: アクションと、アクションの中で動くページのフィールドの受け方と、フォローステップを定義するファイルは、時刻と乱数を直に使わない（ctx.now・ctx.today と ctx.newId を使う）", () => {
  const defining = [...sources, ...added].filter(
    f =>
      /\bdefineAction\s*\(|\bpageFieldsInput\b|\bpageFieldsWay\b|\bFollowStepDef\b/.test(f.text) &&
      !f.rel.endsWith("def/action.ts") &&
      !f.rel.endsWith("def/follow-step.ts"),
  )
  expect(defining.length).toBeGreaterThan(0)
  const bad = defining
    .filter(f => /\bDate\b|\bMath\.random\b|\bcrypto\.|\bperformance\.now\b/.test(f.text.replace(/\/\/.*$/gm, "")))
    .map(f => relative(ROOT, f.path))
  expect(bad).toEqual([])
})

// ページを替えるのは土台の putPage だけ。プラグイン（ビルトインと見本）はブックを { ...book, pages } で組み直さない（新しいブックを作る create の pages: [] は除く）
test("プラグインはブックのページを { ...book, pages } で組み直さない（putPage を使う）", () => {
  const rebuild = /\.\.\.\s*\w+\s*,\s*pages\s*(?:[,}]|:(?!\s*\[\s*\]))/
  const offenders = [...sources.filter(f => crateOf(f.rel) === "plugins"), ...added]
    .filter(f => rebuild.test(f.text))
    .map(f => f.rel)
  expect(offenders).toEqual([])
})

// 自分の物は返した定義（STAR.id）か kit.name(名前) で名指す（conventions/definitions.md の「id」）。プラグイン（ビルトインと見本）のコードに、
// 自分の id で始まる文字列を書かない。core/catalog.ts への書き足し（declare module の中）と文言（messages.ts）、見本のテスト（test/）は除く
const kitIdOf = (dir: string): string | null => {
  try {
    return /pluginKit\(\s*["']([^"']+)["']/.exec(readFileSync(join(dir, "kit.ts"), "utf8"))?.[1] ?? null
  } catch {
    return null
  }
}

test("プラグインは自分の物を、自分の id で始まる文字列で名指さない（返した定義の id か kit.name を使う）", () => {
  const files = [
    ...sources
      .filter(f => crateOf(f.rel) === "plugins" && f.rel.split("/").length > 2)
      .map(f => ({ ...f, root: join(SRC, pluginRoot(f.rel)) })),
    ...added
      .filter(f => f.rel.split("/")[1] !== "test" && plugins.includes(f.rel.split("/")[0]!)) // 連携ポイントは kit を持たない
      .map(f => ({ ...f, root: join(ADDED, f.rel.split("/")[0]!) })),
  ]
  // どのプラグインも kit.ts から id が読める（読めないプラグインを見張りから黙って外さない）
  expect([...new Set(files.map(f => f.root))].filter(root => kitIdOf(root) === null)).toEqual([])
  const offenders = files.flatMap(f => {
    const id = kitIdOf(f.root)
    if (id === null || basename(f.rel) === "messages.ts") return []
    const own = new RegExp(`["'\`]${id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:`)
    return withoutDeclareModule(f.text)
      .split("\n")
      .flatMap((line, i) => (own.test(line) ? [`${f.rel}:${i + 1}: ${line.trim()}`] : []))
  })
  expect(offenders).toEqual([])
})

// 定義オブジェクトの拡張ポイント（core/catalog.ts の …Extras）への書き足しの名前（conventions/definitions.md の「拡張ポイント」）:
// base は短い名前、ほかのプラグイン（ビルトイン・見本・連携ポイント）は自分の id で始まる "<id>:<名前>" だけ。
// 連携ポイントは、持ち主の見本（ex6-spec → ex6）の id で、拡張ポイントにだけ書き足す
const EXTRAS = new Set(
  [...readFileSync(join(SRC, "core/catalog.ts"), "utf8").matchAll(/^export interface (\w+Extras)\b/gm)].map(m => m[1]!),
)
// 波かっこの組の中身（start は開きかっこの位置）
const braced = (text: string, start: number): string => {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}" && --depth === 0) return text.slice(start + 1, i)
  }
  return ""
}
// declare module の中の interface の名前と、その中の最上位の名前
const augmented = (text: string) =>
  [...text.matchAll(/declare module\s+["'][^"']+["']\s*\{/g)].flatMap(m => {
    const body = braced(text, m.index + m[0].length - 1)
    return [...body.matchAll(/interface\s+(\w+)[^{]*\{/g)].map(i => ({
      name: i[1]!,
      members: [
        ...braced(body, i.index + i[0].length - 1).matchAll(
          /^\s*(?:readonly\s+)?("[^"]+"|[A-Za-z_$][\w$]*|\[[^\]]+\])\??\s*[(:<]/gm,
        ),
      ].map(x => x[1]!),
    }))
  })

test("拡張ポイントへの書き足しは、base は短い名前、ほかのプラグインは自分の id で始まる名前だけ", () => {
  expect(EXTRAS.size).toBeGreaterThan(0)
  const owners = [
    ...sources
      .filter(f => crateOf(f.rel) === "plugins" && f.rel.split("/").length > 2)
      .map(f => ({ f, id: kitIdOf(join(SRC, pluginRoot(f.rel))), spec: false })),
    ...added.map(f => {
      const folder = f.rel.split("/")[0]!
      const spec = specs.includes(folder)
      return { f, id: kitIdOf(join(ADDED, spec ? specOwner(folder) : folder)), spec }
    }),
  ]
  const bad = owners.flatMap(({ f, id, spec }) =>
    augmented(f.text).flatMap(({ name, members }) => {
      if (!EXTRAS.has(name)) return spec ? [`${f.rel}: ${name}（連携ポイントは拡張ポイントにだけ書き足す）`] : []
      return members
        .filter(m => (id === "@matomezu/base" ? !/^[A-Za-z_$]/.test(m) : !m.startsWith(`"${id}:`)))
        .map(m => `${f.rel}: ${name}.${m}`)
    }),
  )
  // 見張りが空振りしていない（base・紙・見本の連携ポイントの書き足しを見ている）
  expect(owners.some(({ f }) => augmented(f.text).some(a => EXTRAS.has(a.name)))).toBe(true)
  expect(bad).toEqual([])
})
