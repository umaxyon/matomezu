// マークダウンのブックの、縮める倍率（shrink.ts）と、段落の中の改行 1 つの利用者の設定の値の読み方（soft-break.ts）
import { expect, test } from "bun:test"
import { shrinkTo } from "../../../../web/src/plugins/books/markdown/shrink"
import { softBreakOf } from "../../../../web/src/plugins/books/markdown/soft-break"

test("縮める倍率は、ペインが紙より狭いときだけ 1 より小さい", () => {
  expect(shrinkTo(400, 800)).toBe(0.5)
  expect(shrinkTo(1000, 800)).toBe(1)
  expect(shrinkTo(0, 800)).toBe(1)
})

test("段落の中の改行 1 つの設定の値は、形に合わない値なら「改行にする」", () => {
  expect(softBreakOf("space")).toBe("space")
  expect(softBreakOf("line-break")).toBe("line-break")
  expect(softBreakOf(true)).toBe("line-break")
})
