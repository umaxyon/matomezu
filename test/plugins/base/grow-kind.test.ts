// 可変ページの決め方の種類（plugins/base/place/grow.ts の growKindOf）と、それを読む canGrow・growChoices
import { expect, test } from "bun:test"
import { canGrow, growChoices, growKindOf } from "../../../web/src/plugins/base/place/grow"
import { CORE_CATALOG } from "../../support"

const SIDES = { up: false, down: true, left: false, right: true }

test("決め方の種類: 無ければ none、いつも可変ページなら always、タイプが決めるなら by-type、利用者が選ぶなら選べる向きの一覧", () => {
  expect(growKindOf(undefined)).toBe("none")
  expect(growKindOf({ always: SIDES })).toBe("always")
  expect(growKindOf({ sides: () => SIDES })).toBe("by-type")
  expect(growKindOf({ choices: ["right-down", "down"] })).toEqual(["right-down", "down"])
})

test("可変ページにする・やめるを選べるのは、決め方があり、いつも可変ページでないタイプだけ。選べる向きは利用者が選ぶタイプだけが持つ", () => {
  for (const t of CORE_CATALOG.pageTypes.values()) {
    const kind = growKindOf(t.grow)
    expect(canGrow(CORE_CATALOG, t.id)).toBe(kind !== "none" && kind !== "always")
    expect(growChoices(CORE_CATALOG, t.id)).toEqual(typeof kind === "string" ? [] : kind)
  }
  // 図面は利用者が向きを選ぶ
  expect(growChoices(CORE_CATALOG, "@matomezu/drawing:drawing").length).toBeGreaterThan(0)
})
