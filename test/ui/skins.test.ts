import { describe, expect, test } from "bun:test"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { defineSkin, SKIN_TOKENS } from "../../web/src/core/def/skin"
import { autoSkin } from "../../web/src/core/skin"
import { BUILTIN } from "../../web/src/plugins"
import { DARK } from "../../web/src/plugins/base/looks/dark"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { skinCss } from "../../web/src/ui/skins/css"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

// 追加プラグインのスキン（機能台帳の型の側には書き足さない）
const ACME_DARK = defineSkin({ ...DARK, id: "acme:dark" })
const acme = definePlugin({ id: "acme", skins: [ACME_DARK] })

describe("スキン", () => {
  test("スキンの CSS は、data-skin で選ぶ規則と、OS に合わせる規則を持ち、スキンキーを全部出す", () => {
    const css = skinCss(CORE_CATALOG.skins, autoSkin(CORE_CATALOG))
    for (const id of CORE_CATALOG.skins.keys()) expect(css).toContain(`:root[data-skin="${id}"]`)
    expect(css).toContain("prefers-color-scheme: light")
    for (const k of SKIN_TOKENS) expect(css).toContain(`--skin-${k}:`)
  })

  test("自動のスキンは、決めなければ表で最初に出てくる明と暗。決めたものは明暗が合っていなければ誤り", () => {
    expect(autoSkin(CORE_CATALOG)).toEqual({ light: "@matomezu/base:light", dark: "@matomezu/base:dark" })
    const catalog = buildCoreCatalog({ ...BUILTIN_PARTS, skins: [...BUILTIN_PARTS.skins, ACME_DARK] })
    expect(autoSkin(catalog, { dark: "acme:dark" })).toEqual({ light: "@matomezu/base:light", dark: "acme:dark" })
    expect(() => autoSkin(catalog, { light: "acme:dark" })).toThrow("E111")
    expect(() => autoSkin(catalog, { dark: "nope" })).toThrow("E111")
  })

  test("片方の明暗のスキンしか無ければ、自動はそれを使う。スキンが無ければ自動も無い", () => {
    const darkOnly = buildCoreCatalog({ ...BUILTIN_PARTS, skins: [DARK] })
    expect(autoSkin(darkOnly)).toEqual({ light: "@matomezu/base:dark", dark: "@matomezu/base:dark" })
    expect(autoSkin(buildCoreCatalog({ ...BUILTIN_PARTS, skins: [] }))).toBeNull()
  })

  test("プラグインのスキンを持ち込み、自動のスキンにでき、設定で選べる。インスタンスに無いスキンは選べない", () => {
    const instance = createMatomezu({
      plugins: [...BUILTIN, acme],
      partial: true,
      home: "@matomezu/master:master",
      autoSkin: { dark: "acme:dark" as "@matomezu/base:dark" },
    })
    expect(instance.autoSkin).toEqual({ light: "@matomezu/base:light", dark: "acme:dark" })
    expect(instance.actions.perform("@matomezu/base:settings-skin", { skin: "acme:dark" }).ok).toBe(true)
    expect(instance.actions.perform("@matomezu/base:settings-skin", { skin: "nope" }).ok).toBe(false)
    expect(instance.actions.perform("@matomezu/base:settings-skin", { skin: "auto" }).ok).toBe(true)
  })
})
