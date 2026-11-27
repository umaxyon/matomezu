// slide のプラグインの台帳の確かめ: ページのタイプの slide.allowed には、ケイパビリティ on-slide を持つ形だけを書ける（E134）
import { expect, test } from "bun:test"
import { ON_SLIDE_CHECK } from "../../../../web/src/plugins/items/slide/check"
import { BUILTIN_PARTS, CORE_CATALOG } from "../../../support"

test("slide.allowed に、ケイパビリティ on-slide を持たない形を書いたタイプは E134", () => {
  const drawing = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/drawing:drawing")!
  const bad = { ...drawing, slide: { allowed: ["@matomezu/box:shape-box"], background: true as const } }
  expect(ON_SLIDE_CHECK(CORE_CATALOG).map(p => p.code)).toEqual([])
  const catalog = { ...CORE_CATALOG, pageTypes: new Map([...CORE_CATALOG.pageTypes, [drawing.id, bad]]) }
  expect(ON_SLIDE_CHECK(catalog as typeof CORE_CATALOG).map(p => p.code)).toEqual(["E134"])
})
