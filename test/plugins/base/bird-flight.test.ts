// 鳥の動きの長さ
import { expect, test } from "bun:test"
import { PEEK_VISIT_LENGTH } from "../../../web/src/plugins/base/birds/flight"

test("顔を出して立ち寄る長さは、顔を出してから着地するまで", () => {
  expect(PEEK_VISIT_LENGTH).toBe(4)
})
