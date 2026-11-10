import { expect, test } from "bun:test"
import { textWidth } from "../../../../web/src/plugins/base"
import { EMPTY_TEXT_WIDTH, TEXT_LINE_HEIGHT } from "../../../../web/src/plugins/items/slide/slide"
import { textFitSize, wrapsIn } from "../../../../web/src/plugins/items/slide/text-fit"

const font = (size: number) => ({ size, weight: 400 as const })

test("折り返さない枠: 空は空の幅と 1 行の高さ、文字があれば最長行の幅に合わせ、改行で高さが行の数になる", () => {
  expect(textFitSize("", 24, null)).toEqual({ w: EMPTY_TEXT_WIDTH, h: Math.ceil(24 * TEXT_LINE_HEIGHT) })
  const one = textFitSize("abcd", 24, null)
  expect(one.w).toBe(Math.ceil(textWidth("abcd", font(24))) + 2)
  const two = textFitSize("abcd\nab", 24, null)
  expect(two.w).toBe(one.w)
  expect(two.h).toBe(Math.ceil(2 * 24 * TEXT_LINE_HEIGHT))
})

test("折り返す枠: 幅は枠のまま、高さだけ折り返した行の数に合う", () => {
  const w = Math.ceil(textWidth("あいうえお", font(24)))
  const fit = textFitSize("あいうえおかきくけこ", 24, w)
  expect(fit.w).toBe(w)
  expect(fit.h).toBe(Math.ceil(2 * 24 * TEXT_LINE_HEIGHT))
})

test("始めから折り返している枠かは、枠の幅より長い行があるかで決まる", () => {
  const w = Math.ceil(textWidth("abcd", font(24)))
  expect(wrapsIn("abcd", 24, w)).toBe(false)
  expect(wrapsIn("abcdefgh", 24, w)).toBe(true)
  expect(wrapsIn("ab\nabcdefgh", 24, w)).toBe(true)
})
