// スライドのバーに並ぶ見た目の入力Formは、アイテムの種類で決まる（view/StyleFields.tsx の fieldsOf）
import { expect, test } from "bun:test"
import { ELLIPSE, FREE_LINE, STRAIGHT_LINE, TEXT_FRAME } from "../../../../web/src/plugins/items/slide/slide"
import { commonFields, fieldsOf, showsGroupBar } from "../../../../web/src/plugins/items/slide/view/StyleFields"

test("文字枠は文字色、線は色・太さ・点線（矢印は直線だけ）、楕円は塗り・枠の色・枠の太さ。知らない種類は何も出さない", () => {
  expect(fieldsOf(TEXT_FRAME.id)).toEqual(["text-color"])
  expect(fieldsOf(FREE_LINE.id)).toEqual(["color", "width", "dashed"])
  expect(fieldsOf(STRAIGHT_LINE.id)).toEqual(["color", "width", "dashed", "arrow"])
  expect(fieldsOf(ELLIPSE.id)).toEqual(["fill", "outline", "outline-width"])
  expect(fieldsOf("other:item")).toEqual([])
})

test("複数を選んだときは、どの種類にもある入力Formだけが並ぶ", () => {
  expect(commonFields([FREE_LINE.id, STRAIGHT_LINE.id])).toEqual(["color", "width", "dashed"])
  expect(commonFields([ELLIPSE.id, FREE_LINE.id])).toEqual([])
  expect(commonFields([TEXT_FRAME.id, TEXT_FRAME.id])).toEqual(["text-color"])
  expect(commonFields([])).toEqual([])
})

test("複数を選んだとき、共通の入力Formが無い組み合わせ（文字枠と楕円）ではバーを出さない", () => {
  expect(showsGroupBar([TEXT_FRAME.id, ELLIPSE.id])).toBe(false)
  expect(showsGroupBar([STRAIGHT_LINE.id, FREE_LINE.id])).toBe(true)
})
