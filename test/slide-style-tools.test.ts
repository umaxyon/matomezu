// スライドのバーに並ぶ見た目の道具は、アイテムの種類で決まる（view/StyleTools.tsx の toolsOf）
import { expect, test } from "bun:test"
import { ELLIPSE, FREE_LINE, STRAIGHT_LINE, TEXT_FRAME } from "../web/src/plugins/items/slide/slide"
import { commonTools, showsGroupBar, toolsOf } from "../web/src/plugins/items/slide/view/StyleTools"

test("文字枠は文字色、線は色・太さ・点線（矢印は直線だけ）、楕円は塗り・枠の色・枠の太さ。知らない種類は何も出さない", () => {
  expect(toolsOf(TEXT_FRAME.id)).toEqual(["text-color"])
  expect(toolsOf(FREE_LINE.id)).toEqual(["color", "width", "dashed"])
  expect(toolsOf(STRAIGHT_LINE.id)).toEqual(["color", "width", "dashed", "arrow"])
  expect(toolsOf(ELLIPSE.id)).toEqual(["fill", "outline", "outline-width"])
  expect(toolsOf("other:item")).toEqual([])
})

test("複数を選んだときは、どの種類にもある道具だけが並ぶ", () => {
  expect(commonTools([FREE_LINE.id, STRAIGHT_LINE.id])).toEqual(["color", "width", "dashed"])
  expect(commonTools([ELLIPSE.id, FREE_LINE.id])).toEqual([])
  expect(commonTools([TEXT_FRAME.id, TEXT_FRAME.id])).toEqual(["text-color"])
  expect(commonTools([])).toEqual([])
})

test("複数を選んだとき、共通の道具が無い組み合わせ（文字枠と楕円）ではバーを出さない", () => {
  expect(showsGroupBar([TEXT_FRAME.id, ELLIPSE.id])).toBe(false)
  expect(showsGroupBar([STRAIGHT_LINE.id, FREE_LINE.id])).toBe(true)
})
