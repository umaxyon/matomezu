// 楕円の枠の色: 未設定は文字色の枠、"none"（NO_OUTLINE）は枠なし
import { expect, test } from "bun:test"
import {
  EllipseProps,
  EMPTY_TEXT_WIDTH,
  NO_OUTLINE,
  TEXT_FRAME,
  TextFrameProps,
} from "../../../../web/src/plugins/items/slide/slide"

test("枠の色は、名前付きの値 none（枠なし）も受け、未設定・代表色・#rrggbb も受ける。ほかの言葉は断る", () => {
  expect(NO_OUTLINE).toBe("none")
  expect(EllipseProps.safeParse({}).success).toBe(true)
  expect(EllipseProps.safeParse({ stroke: "none" }).success).toBe(true)
  expect(EllipseProps.safeParse({ stroke: "#d23b3b" }).success).toBe(true)
  expect(EllipseProps.safeParse({ stroke: "transparent" }).success).toBe(false)
})

test("文字枠を押しただけで置く大きさは、高さが文字 1 行分、幅が空の幅（1 文字より狭い）", () => {
  expect(TEXT_FRAME.size).toEqual({ w: EMPTY_TEXT_WIDTH, h: Math.ceil(24 * 1.3) })
  expect(EMPTY_TEXT_WIDTH).toBeLessThan(24)
})

test("項目の表に無い項目は断る", () => {
  expect(EllipseProps.safeParse({ unknownProp: true }).success).toBe(false)
  expect(TextFrameProps.safeParse({ text: "a", unknownProp: 1.5 }).success).toBe(false)
})
