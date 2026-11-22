// 書庫のツリーの幅: 境目を動かした所から、ツリーの最小と右の中身の最小に収めた整数の幅
import { expect, test } from "bun:test"
import { CONTENT_MIN_WIDTH, TREE_MIN_WIDTH, treeWidthAt } from "../../../web/src/plugins/base/library/tree-width"

test("境目の所がそのままツリーの幅になり、整数に丸める", () => {
  expect(treeWidthAt(300.6, 1000)).toBe(301)
})

test("ツリーの最小より左には寄せない", () => {
  expect(treeWidthAt(40, 1000)).toBe(TREE_MIN_WIDTH)
})

test("右に中身の最小を残す所より右には寄せない", () => {
  expect(treeWidthAt(990, 1000)).toBe(1000 - CONTENT_MIN_WIDTH)
})

test("書庫が狭くて両方の最小が入らないときは、ツリーの最小", () => {
  expect(treeWidthAt(300, TREE_MIN_WIDTH + CONTENT_MIN_WIDTH - 100)).toBe(TREE_MIN_WIDTH)
})
