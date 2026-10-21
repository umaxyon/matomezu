import { describe, expect, test } from "bun:test"
import { defineSkin, SKIN_TOKENS } from "../../web/src/core/def/skin"
import { buildRegistry } from "../../web/src/core/registry"
import { autoSkin } from "../../web/src/core/skin"
import { BUILTIN } from "../../web/src/plugins"
import { DARK } from "../../web/src/plugins/base/dark"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { skinCss } from "../../web/src/ui/skins/css"
import { BUILTIN_PARTS, REGISTRY } from "../support"

// 外のプラグインのスキン（型の表には書き足さない）
const ACME_DARK = defineSkin({ ...DARK, id: "acme/dark" })
const acme = definePlugin({ id: "acme", skins: [ACME_DARK] })

describe("スキン", () => {
  test("スキンの CSS は、data-skin で選ぶ規則と、OS に合わせる規則を持ち、欄を全部出す", () => {
    const css = skinCss(REGISTRY.skins, autoSkin(REGISTRY))
    for (const id of REGISTRY.skins.keys()) expect(css).toContain(`:root[data-skin="${id}"]`)
    expect(css).toContain("prefers-color-scheme: light")
    for (const k of SKIN_TOKENS) expect(css).toContain(`--skin-${k}:`)
  })

  test("自動のスキンは、決めなければ表で最初に出てくる明と暗。決めたものは明暗が合っていなければ誤り", () => {
    expect(autoSkin(REGISTRY)).toEqual({ light: "light", dark: "dark" })
    const reg = buildRegistry({ ...BUILTIN_PARTS, skins: [...BUILTIN_PARTS.skins, ACME_DARK] })
    expect(autoSkin(reg, { dark: "acme/dark" })).toEqual({ light: "light", dark: "acme/dark" })
    expect(() => autoSkin(reg, { light: "acme/dark" })).toThrow("E111")
    expect(() => autoSkin(reg, { dark: "nope" })).toThrow("E111")
  })

  test("片方の明暗のスキンしか無ければ、自動はそれを使う。スキンが無ければ自動も無い", () => {
    const darkOnly = buildRegistry({ ...BUILTIN_PARTS, skins: [DARK] })
    expect(autoSkin(darkOnly)).toEqual({ light: "dark", dark: "dark" })
    expect(autoSkin(buildRegistry({ ...BUILTIN_PARTS, skins: [] }))).toBeNull()
  })

  test("プラグインのスキンを持ち込み、自動のスキンにでき、設定で選べる。app に無いスキンは選べない", () => {
    const app = createMatomezu({
      plugins: [...BUILTIN, acme],
      partial: true,
      home: "master",
      autoSkin: { dark: "acme/dark" as "dark" },
    })
    expect(app.autoSkin).toEqual({ light: "light", dark: "acme/dark" })
    expect(app.actions.setSkin("acme/dark")).toBe(true)
    expect(app.actions.setSkin("nope")).toBe(false)
    expect(app.actions.setSkin("auto")).toBe(true)
  })
})
