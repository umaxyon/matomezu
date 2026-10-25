import { expect, test } from "bun:test"
import { Glob } from "bun"
import { PALETTE } from "../../web/src/core/color"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { defineTheme, THEME_TOKENS, themeVar, themeVarName } from "../../web/src/core/def/theme"
import { resolveTokens, shades } from "../../web/src/core/theme"
import { STANDARD } from "../../web/src/plugins/base/looks/standard"
import { themeVars } from "../../web/src/ui/theme-vars"
import { BUILTIN_PARTS } from "../support"

test("欄の値は、色 1 つか片方だけなら明暗どちらでもその色、両方なら明暗ごとの色", () => {
  expect(shades("#fff")).toEqual({ light: "#fff", dark: "#fff" })
  expect(shades({ light: "#fff" })).toEqual({ light: "#fff", dark: "#fff" })
  expect(shades({ dark: "#222" })).toEqual({ light: "#222", dark: "#222" })
  expect(shades({ light: "#fff", dark: "#222" })).toEqual({ light: "#fff", dark: "#222" })
})

test("明暗で違う色は light-dark() の CSS 変数になり、ブックの中身は OS の明暗に合わせる", () => {
  const night = defineTheme({ ...STANDARD, base: { ...STANDARD.base, paper: { light: "#ffffff", dark: "#26262b" } } })
  const catalog = buildCoreCatalog({ ...BUILTIN_PARTS, themes: [night] })
  const vars = themeVars(resolveTokens(catalog, "standard", [{ id: "box.fill", fallback: "paper" }])) as Record<
    string,
    string
  >
  expect(vars["--theme-paper"]).toBe("light-dark(#ffffff, #26262b)")
  expect(vars["--theme-box-fill"]).toBe("light-dark(#ffffff, #26262b)")
  expect(vars["--theme-text"]).toBe(STANDARD.base.text)
  expect(vars.colorScheme).toBe("light dark")
})

test("欄の CSS 変数の名前は、頭に --theme-、id の「/」は「--」、「.」は「-」", () => {
  expect(themeVarName("box.fill")).toBe("--theme-box-fill")
  expect(themeVarName("ex3/star.fill")).toBe("--theme-ex3--star-fill")
  expect(themeVar("palette.primary.ink")).toBe("var(--theme-palette-primary-ink)")
  expect(Object.keys(themeVars({ "ex3/star.fill": shades("#ffd34d") }))).toContain("--theme-ex3--star-fill")
})

test("ビルトインプラグインと画面の CSS とビューが書いた --theme-… は、どれも宣言した欄の変数", async () => {
  const declared = new Set(
    [
      ...THEME_TOKENS,
      ...PALETTE.flatMap(name => [`palette.${name}`, `palette.${name}.ink`]),
      ...BUILTIN_PARTS.bookTypes.flatMap(t => t.tokens.map(d => d.id)),
      ...BUILTIN_PARTS.items.flatMap(i => (i.tokens ?? []).map(d => d.id)),
    ].map(themeVarName),
  )
  const unknown: string[] = []
  for await (const file of new Glob("web/src/{plugins,ui}/**/*.{ts,tsx,css}").scan()) {
    const src = await Bun.file(file).text()
    for (const [, name] of src.matchAll(/(--theme-[a-z0-9-]+)(?![a-z0-9-]*\$)/g))
      if (!declared.has(name as string)) unknown.push(`${file}: ${name}`)
  }
  expect(unknown).toEqual([])
})
