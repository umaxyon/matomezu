// 楕円の枠の色: 未設定は文字色の枠、"none"（NO_OUTLINE）は枠なし
import { expect, test } from "bun:test"
import { EllipseProps, NO_OUTLINE, TEXT_FRAME } from "../../../../web/src/plugins/items/slide/slide"

test("枠の色は、名前付きの値 none（枠なし）も受け、未設定・代表色・#rrggbb も受ける。ほかの言葉は断る", () => {
  expect(NO_OUTLINE).toBe("none")
  expect(EllipseProps.safeParse({}).success).toBe(true)
  expect(EllipseProps.safeParse({ stroke: "none" }).success).toBe(true)
  expect(EllipseProps.safeParse({ stroke: "#d23b3b" }).success).toBe(true)
  expect(EllipseProps.safeParse({ stroke: "transparent" }).success).toBe(false)
})

test("文字枠を押しただけで置く大きさは、高さが文字 1 行分、幅が 8 文字分", () => {
  expect(TEXT_FRAME.size).toEqual({ w: 24 * 8, h: Math.ceil(24 * 1.3) })
})
