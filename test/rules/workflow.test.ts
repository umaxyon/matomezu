// 「作業の進め方」の決まりを見張る: 単体のテストの置き場、e2e、テストの用意の手段
import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, normalize, relative, resolve } from "node:path"
import { CRATES, filesUnder, ROOT, SRC, sources } from "./sources"

// 単体のテストの置き場: test の直下は全体を見張るテストだけ。test/<クレート> はそのクレート（かその置き場の手伝い）を、test/plugins/<置き場> はそのプラグインを、test/scripts は scripts のスクリプトを、test/clients/<AI の名前> はその AI ごとの部品を読む
test("単体のテストは、確かめる物の置き場（クレート・test/plugins/<プラグイン>・test/scripts・test/clients/<AI の名前>）に置く", () => {
  const TEST = join(ROOT, "test")
  const tests = filesUnder(TEST)
    .filter(path => /\.test\.tsx?$/.test(path) && !path.includes("/added-plugins/") && !path.includes("/type-checks/"))
    .map(path => ({ rel: relative(TEST, path), text: readFileSync(path, "utf8") }))
  // 値で読む先（import type と、型だけを並べた import { type A, type B } は数えない）
  const typeOnly = (kw: string | undefined, names: string) =>
    kw !== undefined ||
    (names.startsWith("{") &&
      names
        .replace(/[{}]/g, "")
        .split(",")
        .map(n => n.trim())
        .filter(n => n !== "")
        .every(n => /^type\s/.test(n)))
  const targetsOf = (rel: string, text: string) =>
    [...text.matchAll(/^import\s+(type\s+)?([^"']*?)\s*from\s*["'](\.{1,2}\/[^"']+)["']/gm)]
      .filter(m => !typeOnly(m[1], m[2]!.trim()))
      .map(m => normalize(join(dirname(rel), m[3]!)))
  const CRATE_DIRS = [...CRATES, "plugins"]
  const ROOT_TESTS = ["engine.test.ts", "fonts.test.ts", "plugin-api.test.ts"]
  const bad = tests.flatMap(({ rel, text }) => {
    const parts = rel.split("/")
    if (parts.length === 1) return ROOT_TESTS.includes(rel) ? [] : [`${rel}: test の直下`]
    const reads = targetsOf(rel, text)
    if (parts[0] === "rules")
      return parts.length === 2 &&
        existsSync(join(ROOT, "conventions", rel.slice("rules/".length).replace(/\.test\.tsx?$/, ".md")))
        ? []
        : [`${rel}: 規約の md の名前でない`]
    if (parts[0] === "scripts")
      return reads.some(t => t.startsWith("../scripts/")) ? [] : [`${rel}: scripts のスクリプトを読まない`]
    if (parts[0] === "clients") {
      const ai = parts.slice(1, -1).join("/")
      if (ai === "") return [`${rel}: test/clients の直下`]
      return reads.some(t => t.startsWith(`../clients/${ai}/`)) ? [] : [`${rel}: clients/${ai} を読まない`]
    }
    if (!CRATE_DIRS.includes(parts[0]!)) return [`${rel}: クレートの名前でないフォルダ`]
    if (parts[0] === "plugins") {
      const place = parts.slice(1, -1).join("/")
      if (place === "") return [`${rel}: test/plugins の直下`]
      return reads.some(t => t.startsWith(`../web/src/plugins/${place}`)) ? [] : [`${rel}: plugins/${place} を読まない`]
    }
    const crate = parts[0]!
    const own = reads.some(t => t.startsWith(`../web/src/${crate}/`) || t.startsWith(`${crate}/`))
    const onlyPlugins = reads.filter(t => t.startsWith("../web/src/")).every(t => t.startsWith("../web/src/plugins/"))
    return !own && onlyPlugins && reads.some(t => t.startsWith("../web/src/plugins/"))
      ? [`${rel}: プラグインだけを読む`]
      : []
  })
  expect(bad).toEqual([])
})

// e2e は web/src の値を読まない（画面とホストの外から確かめる）。型は読んでよい（import type はビルドで消える）。
// e2e が相対で読む test/ のファイルも、その先まで同じに見る
test("e2e は web/src の値を読まない（型は読んでよい。e2e が読む test/ のファイルが読む物も見る）", () => {
  const TEST = join(ROOT, "test")
  const importsOf = (path: string, text: string) =>
    [
      ...text.matchAll(
        // 1 つの文の中だけ: 名前の並び（{ … } は行をまたいでよい）か、行の中の名前のあとの from。副作用だけの import と import() も拾う
        /^(import|export)\s+(type\s+)?(?:[\w*\s,]*\{[^}"']*\}|[^\n"'{]*?)\s*from\s*["']([^"']+)["']|^import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']/gm,
      ),
    ].map(m => ({
      typeOnly: m[3] !== undefined && m[2] !== undefined,
      to: m[3] ?? m[4] ?? m[5]!,
      path,
    }))
  const withTs = (p: string) => (existsSync(p) ? p : ([".ts", ".tsx"].map(e => p + e).find(existsSync) ?? p))
  const seen = new Set<string>()
  const queue = filesUnder(join(ROOT, "e2e"))
  const offenders: string[] = []
  let typeReads = 0
  while (queue.length > 0) {
    const path = queue.pop()!
    if (seen.has(path)) continue
    seen.add(path)
    for (const i of importsOf(path, readFileSync(path, "utf8"))) {
      if (!i.to.startsWith(".")) continue
      const target = resolve(dirname(path), i.to)
      if (target.startsWith(`${SRC}/`)) {
        if (i.typeOnly) typeReads++
        else offenders.push(`${relative(ROOT, path)}: ${i.to}`)
      } else if (target.startsWith(`${TEST}/`)) queue.push(withTs(target))
    }
  }
  // 見張りが空振りしていない（test/lineup.ts を通した型の読み込みを見ている）
  expect(seen.has(join(TEST, "lineup.ts"))).toBe(true)
  expect(typeReads).toBeGreaterThan(0)
  expect(offenders).toEqual([])
})

// 決まった時間だけ待つ代わりに: 画面の様子が変わるのを待つ（expect・expect.poll）。起きないはずの事は、e2e/helpers/frames.ts の afterFrames の後で確かめる。
// 時間で決まる動き（長押しなど）は page.clock で進める
test("e2e は、決まった時間だけ待って先へ進まない（e2e/perf は除く）", () => {
  // 常駐が答えるまで繰り返し問う間の待ち（先へ進むのは答えが来てから）
  const retries: Record<string, number> = { "e2e/fixtures.ts": 1 }
  const waits = filesUnder(join(ROOT, "e2e"))
    .map(path => relative(ROOT, path))
    .filter(rel => !rel.startsWith("e2e/perf/"))
    .flatMap(rel => {
      const n = [...readFileSync(join(ROOT, rel), "utf8").matchAll(/\bwaitForTimeout\(|\bsetTimeout\(/g)].length
      return n > (retries[rel] ?? 0) ? [`${rel}: ${n}`] : []
    })
  expect(waits).toEqual([])
})

// テストの用意の手段（名前が ForTest で終わる物と、Go のビルドタグ e2e）は、テスト（test/・e2e/・e2e の常駐を作るスクリプト）の外から使わない
describe("テストの用意の手段", () => {
  const goUnder = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? goUnder(join(dir, e.name)) : e.name.endsWith(".go") ? [join(dir, e.name)] : [],
    )
  const goAll = ["cmd", "internal"]
    .flatMap(d => goUnder(join(ROOT, d)))
    .map(path => ({ rel: relative(ROOT, path), text: readFileSync(path, "utf8") }))
  const tagged = (text: string, tag: string) => new RegExp(`^//go:build ${tag}$`, "m").test(text)
  const goFiles = goAll.filter(f => !f.rel.endsWith("_test.go"))
  const e2eFiles = goFiles.filter(f => tagged(f.text, "e2e"))
  const offFiles = goFiles.filter(f => tagged(f.text, "!e2e"))
  const funcsOf = (text: string) =>
    new Map(
      [...text.matchAll(/^func (?:\([^)]*\) )?(\w+)\(.*\}$|^func (?:\([^)]*\) )?(\w+)\([\s\S]*?^}$/gm)].map(m => [
        m[1] ?? m[2]!,
        m[0],
      ]),
    )
  // 本番の実行ファイルで空になる関数（ビルドタグ !e2e のファイルに置き、同じ名前の中身を e2e のファイルに置く）は、本番のコードから呼んでよい
  const stubs = new Set(offFiles.flatMap(f => [...f.text.matchAll(/^func (\w+ForTest)\(/gm)].map(m => m[1]!)))

  test("本番のコード（web/src と、e2e のタグの付かない Go のファイル）に、ForTest で終わる名前と for-test のパスを書かない（!e2e の空の関数を呼ぶのは除く）", () => {
    expect(goFiles.length).toBeGreaterThan(0)
    const named = (text: string) => [...text.matchAll(/\w+ForTest\b|for-test/g)].some(m => !stubs.has(m[0]))
    const plain = goFiles.filter(f => !tagged(f.text, "e2e") && !tagged(f.text, "!e2e"))
    expect([
      ...sources.filter(f => /\w+ForTest\b|for-test/.test(f.text)).map(f => `web/src/${f.rel}`),
      ...plain.filter(f => named(f.text)).map(f => f.rel),
    ]).toEqual([])
  })

  test("ビルドタグ !e2e のファイルには、中身の無い ForTest の関数だけを置き、同じ名前の関数を e2e のファイルに置く", () => {
    const inE2e = new Set(e2eFiles.flatMap(f => [...funcsOf(f.text).keys()]))
    expect(
      offFiles.flatMap(f =>
        [...funcsOf(f.text)]
          .filter(([name, text]) => !name.endsWith("ForTest") || !text.endsWith("{}") || !inE2e.has(name))
          .map(([name]) => `${f.rel}: ${name}`),
      ),
    ).toEqual([])
    expect(offFiles.filter(f => /for-test/.test(f.text.replace(/^\/\/.*$/gm, ""))).map(f => f.rel)).toEqual([])
  })

  test("ビルドタグ e2e を付けて組むのは、e2e の常駐を作るスクリプトだけ", () => {
    const scripts = filesUnder(join(ROOT, "scripts")).map(p => relative(ROOT, p))
    const tests = filesUnder(join(ROOT, "e2e")).map(p => relative(ROOT, p))
    const places = [
      ...scripts,
      ...tests,
      "package.json",
      ...readdirSync(ROOT).filter(f => /^playwright.*\.ts$/.test(f)),
    ]
    expect(
      places.filter(p => /-tags[\s"',=]+[\w,\s"']*\be2e\b/.test(readFileSync(join(ROOT, p), "utf8"))).sort(),
    ).toEqual(["scripts/e2e-build.ts"])
  })

  test("e2e のファイルと、同じクレートの Go のテストのファイルの両方にある関数は、同じ中身にする（go test はタグを付けずに流す）", () => {
    const differ = e2eFiles.flatMap(e => {
      const mine = funcsOf(e.text)
      return goAll
        .filter(t => t.rel.endsWith("_test.go") && dirname(t.rel) === dirname(e.rel))
        .flatMap(t =>
          [...funcsOf(t.text)]
            .filter(([n, body]) => mine.has(n) && mine.get(n) !== body)
            .map(([n]) => `${t.rel}: ${n}`),
        )
    })
    expect(differ).toEqual([])
  })
})
