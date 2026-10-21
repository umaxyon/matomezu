import { expect, test } from "bun:test"
import { defineTheme } from "../../web/src/core/def/theme"
import { buildRegistry } from "../../web/src/core/registry"
import { resolveTokens, shades } from "../../web/src/core/theme"
import { STANDARD } from "../../web/src/plugins/base/standard"
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
  const reg = buildRegistry({ ...BUILTIN_PARTS, themes: [night] })
  const vars = themeVars(resolveTokens(reg, "standard", [{ id: "box.fill", fallback: "paper" }])) as Record<
    string,
    string
  >
  expect(vars["--theme-paper"]).toBe("light-dark(#ffffff, #26262b)")
  expect(vars["--theme-box-fill"]).toBe("light-dark(#ffffff, #26262b)")
  expect(vars["--theme-text"]).toBe(STANDARD.base.text)
  expect(vars.colorScheme).toBe("light dark")
})
