// アノテーションの結び付く物の id の並びを、base の機能が扱う所（plugins/base/utils/anchors.ts）
import { expect, test } from "bun:test"
import { z } from "zod"
import { AnchorsArg, lastAnchor } from "../../../web/src/plugins/base/utils/anchors"

test("アクションの引数は、AI には id の並び（1 つ以上）として見せる（まとめるのは note.test が行って確かめる）", () => {
  expect(z.toJSONSchema(AnchorsArg, { io: "input" })).toMatchObject({ type: "array", minItems: 1 })
  expect(z.toJSONSchema(AnchorsArg, { io: "input" })).not.toHaveProperty("prefixItems")
})

test("結び付く物の最後の 1 つ", () => {
  expect(lastAnchor(["a"])).toBe("a")
  expect(lastAnchor(["a", "b"])).toBe("b")
})
