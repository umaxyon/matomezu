import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { Glob } from "bun"
import { PALETTE } from "../../web/src/core/color"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { defineTheme, THEME_TOKENS, themeVar, tokenVarName } from "../../web/src/core/def/theme"
import { resolveTokens, shades } from "../../web/src/core/theme"
import { STANDARD } from "../../web/src/plugins/base/looks/standard"
import { FILE_COLOR, FOLDER_COLOR } from "../../web/src/plugins/books/dir/dir"
import { NODE_FILL } from "../../web/src/plugins/books/tree/tree"
import { LIST_FILL } from "../../web/src/plugins/items/list/list"
import { ownTokenVars, themeVars } from "../../web/src/ui/theme-vars"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

test("テーマキーの値は、色 1 つか片方だけなら明暗どちらでもその色、両方なら明暗ごとの色", () => {
  expect(shades("#fff")).toEqual({ light: "#fff", dark: "#fff" })
  expect(shades({ light: "#fff" })).toEqual({ light: "#fff", dark: "#fff" })
  expect(shades({ dark: "#222" })).toEqual({ light: "#222", dark: "#222" })
  expect(shades({ light: "#fff", dark: "#222" })).toEqual({ light: "#fff", dark: "#222" })
})

test("明暗で違う色は light-dark() の CSS 変数になり、ブックの中身は OS の明暗に合わせる", () => {
  const night = defineTheme({ ...STANDARD, base: { ...STANDARD.base, paper: { light: "#ffffff", dark: "#26262b" } } })
  const catalog = buildCoreCatalog({ ...BUILTIN_PARTS, themes: [night] })
  const vars = themeVars(
    resolveTokens(catalog, "@matomezu/base:standard", [{ id: "@matomezu/box:box-fill", fallback: "paper" }]),
  ) as Record<string, string>
  expect(vars["--theme-paper"]).toBe("light-dark(#ffffff, #26262b)")
  expect(vars[tokenVarName("@matomezu/box:box-fill")]).toBe("light-dark(#ffffff, #26262b)")
  expect(vars["--theme-text"]).toBe(STANDARD.base.text)
  expect(vars.colorScheme).toBe("light dark")
})

test("テーマキーの CSS 変数の名前: 土台のテーマキーは --theme-<名前>、プラグインのテーマキーは中だけの名前（id ごとに別）で、見た目では --<名前>", () => {
  expect(tokenVarName("paper")).toBe("--theme-paper")
  expect(tokenVarName("palette.primary.ink")).toBe("--theme-palette-primary-ink")
  expect(tokenVarName("@matomezu/box:box-fill")).toBe("--theme-_40matomezu_2fbox_3abox-fill")
  expect(tokenVarName("a.b:fill")).not.toBe(tokenVarName("a-b:fill"))
  expect(themeVar("palette.primary.ink")).toBe("var(--theme-palette-primary-ink)")
  expect(themeVar("ex3:star-fill")).toBe("var(--star-fill)")
  expect(Object.keys(themeVars({ "ex3:star-fill": shades("#ffd34d") }))).toContain(tokenVarName("ex3:star-fill"))
  // プラグインの見た目に置くのは、そのプラグインのテーマキーだけ
  expect(ownTokenVars(["ex3:star-fill", "ex2:diamond-fill", "accent"], "ex3") as Record<string, string>).toEqual({
    "--star-fill": `var(${tokenVarName("ex3:star-fill")})`,
  })
})

test("ビルトインプラグインと画面の CSS とビューが書いた --theme-… は土台のテーマキー、var(--…) は自分のテーマキーか自分で置く変数", async () => {
  const core = new Set(
    [...THEME_TOKENS, ...PALETTE.flatMap(name => [`palette.${name}`, `palette.${name}.ink`])].map(tokenVarName),
  )
  const own = new Map<string, Set<string>>() // プラグインのフォルダ → 自分のテーマキーの --名前（アイテム・タイプ・プラグインが持つもの）
  for (const t of [
    ...[...BUILTIN_PARTS.bookTypes, ...BUILTIN_PARTS.items].flatMap(d => d.tokens),
    ...BUILTIN_PARTS.tokens,
  ]) {
    const dir = dirOf(t.id)
    own.set(dir, (own.get(dir) ?? new Set()).add(`--${t.id.split(":")[1]}`))
  }
  const unknown: string[] = []
  const sources = new Map<string, string>()
  for await (const file of new Glob("web/src/{plugins,ui}/**/*.{ts,tsx,css}").scan())
    sources.set(file, await Bun.file(file).text())
  // コードが置く変数（style の "--名前" と CSS の --名前:）
  const placed = new Set(
    [...sources.values()].flatMap(s =>
      [...s.matchAll(/"(--[a-z][a-z0-9-]*)"|(--[a-z][a-z0-9-]*):/g)].map(m => m[1] ?? m[2]!),
    ),
  )
  for (const [file, src] of sources) {
    for (const [, name] of src.matchAll(/(--theme-[a-z0-9-]+)(?![a-z0-9-]*\$)/g))
      if (!core.has(name as string)) unknown.push(`${file}: ${name}`)
    const dir = [...own.keys()].find(d => file.startsWith(d))
    if (!dir) continue
    // 名前を組み立てる所（var(--data-series-${…})）は見ない
    for (const [, name] of src.matchAll(/var\((--[a-z][a-z0-9-]*)(?![a-z0-9-]*\$)/g))
      if (
        !name!.startsWith("--theme-") &&
        !name!.startsWith("--skin-") &&
        !own.get(dir)?.has(name!) &&
        !placed.has(name!)
      )
        unknown.push(`${file}: ${name}`)
  }
  expect(unknown).toEqual([])
})

// テーマキーの持ち主のビルトインプラグインのフォルダ（アイテムかブックのプラグイン）。知らない持ち主なら落とす（見張る範囲から黙って抜けないように）
const dirOf = (id: string) => {
  const name = id.split(":")[0]!.replace(/^@matomezu\//, "")
  const dir = ["items", "books"].map(kind => `web/src/plugins/${kind}/${name}`).find(d => existsSync(d))
  if (!dir) throw new Error(`テーマキーの持ち主のフォルダが無い: ${id}`)
  return `${dir}/`
}

test("色の候補に使うテーマキーの定義（ダイアログが持つ物）は長い id で宣言し、テーマが上書きした値を引ける", () => {
  for (const def of [LIST_FILL, NODE_FILL, FILE_COLOR, FOLDER_COLOR]) expect(def.id.startsWith("@matomezu/")).toBe(true)
  // matomezu のテーマはフォルダのアイコンを琥珀色に上書きする
  expect(resolveTokens(CORE_CATALOG, "@matomezu/base:matomezu", [FOLDER_COLOR])[FOLDER_COLOR.id]?.light).toBe("#f5a623")
})
