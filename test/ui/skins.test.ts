import { expect, test } from "bun:test"
import { SKIN_TOKENS } from "../../web/src/ui/skins/def"
import { AUTO, SKINS, skinCss } from "../../web/src/ui/skins/index"

test("スキンの id は重ならず、OS の明暗に合わせる組は表にある", () => {
  const ids = SKINS.map(s => s.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).toContain(AUTO.light)
  expect(ids).toContain(AUTO.dark)
})

test("スキンの CSS は、data-skin で選ぶ規則と、OS に合わせる規則を持ち、欄を全部出す", () => {
  const css = skinCss()
  for (const s of SKINS) expect(css).toContain(`:root[data-skin="${s.id}"]`)
  expect(css).toContain("prefers-color-scheme: light")
  for (const k of SKIN_TOKENS) expect(css).toContain(`--skin-${k}:`)
})
