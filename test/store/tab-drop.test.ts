// ページタブのドラッグの、落とす所の計算
import { expect, test } from "bun:test"
import { dropIndex, within } from "../../web/src/plugins/base/page-tabs/tab-drop"

test("dropIndex は中心より右にあるタブの数。左端より左は 0、右端より右は並びの長さ", () => {
  const centers = [50, 150, 250]
  expect(dropIndex(centers, 0)).toBe(0)
  expect(dropIndex(centers, 100)).toBe(1)
  expect(dropIndex(centers, 200)).toBe(2)
  expect(dropIndex(centers, 999)).toBe(3)
  expect(dropIndex([], 10)).toBe(0)
})

test("within は余白を足した範囲の中か", () => {
  const box = { left: 0, right: 100, top: 0, bottom: 30 }
  expect(within(box, { x: 50, y: 40 }, 24)).toBe(true)
  expect(within(box, { x: 50, y: 60 }, 24)).toBe(false)
  expect(within(box, { x: -30, y: 10 }, 24)).toBe(false)
})
