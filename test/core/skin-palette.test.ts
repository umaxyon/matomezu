// 外観枠の代表色（core/skin.ts）: 役割ごとにスキンの明暗の既定を持ち、スキンの palette の上書きが勝ち、上の字は色の明るさで濃い字か白になる。palette の値が #rrggbb でなければ台帳アセンブルで error（E052）
import { expect, test } from "bun:test"
import { checkCoreCatalog } from "../../web/src/core/core-catalog-check"
import { defineSkin } from "../../web/src/core/def/skin"
import { paletteInk, skinPalette } from "../../web/src/core/skin"
import { DARK } from "../../web/src/plugins/base/looks/dark"
import { LIGHT } from "../../web/src/plugins/base/looks/light"
import { BUILTIN_PARTS } from "../support"

test("外観枠の代表色は、スキンの明暗の既定を持ち、スキンの上書きが勝つ", () => {
  expect(skinPalette(LIGHT).primary).toBe("#3b82f6")
  expect(skinPalette(DARK).primary).toBe("#60a5fa")
  const over = defineSkin({ ...DARK, id: "acme:over", palette: { primary: "#112233" } })
  expect(skinPalette(over)).toEqual({ ...skinPalette(DARK), primary: "#112233" })
})

test("上の字は、明るい色には濃い字、暗い色には白", () => {
  expect(paletteInk("#facc15")).toBe("#1b1b1f")
  expect(paletteInk("#112233")).toBe("#ffffff")
})

test("スキンの palette に #rrggbb でない値があれば、台帳アセンブルで error（E052）", () => {
  const bad = defineSkin({ ...DARK, id: "acme:bad", palette: { primary: "blue" } })
  const problems = checkCoreCatalog({ ...BUILTIN_PARTS, skins: [...BUILTIN_PARTS.skins, bad] })
  expect(problems.map(p => p.code)).toContain("E052")
})
