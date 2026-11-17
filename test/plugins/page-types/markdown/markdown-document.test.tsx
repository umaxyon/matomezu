// マークダウンのブックの、縮める倍率（shrink.ts）
import { expect, test } from "bun:test"
import { shrinkTo } from "../../../../web/src/plugins/page-types/markdown/shrink"

test("縮める倍率は、ペインが紙より狭いときだけ 1 より小さい", () => {
  expect(shrinkTo(400, 800)).toBe(0.5)
  expect(shrinkTo(1000, 800)).toBe(1)
  expect(shrinkTo(0, 800)).toBe(1)
})
