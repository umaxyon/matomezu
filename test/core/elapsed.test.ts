// 経った時間（「〜前」）の段（base の elapsedOf）
import { expect, test } from "bun:test"
import { elapsedOf } from "../../web/src/plugins/base/utils/elapsed"

const now = new Date(2026, 9, 27, 15, 0, 0) // 見る人の時間帯の 2026/10/27 15:00
const before = (ms: number) => new Date(now.getTime() - ms)
const MIN = 60_000
const HOUR = 60 * MIN

test("1 分未満は今、1〜59 分は分、1〜23 時間は時間（切り捨て）。先の時刻は今", () => {
  expect(elapsedOf(before(59_000), now)).toEqual({ unit: "now" })
  expect(elapsedOf(before(-5 * MIN), now)).toEqual({ unit: "now" })
  expect(elapsedOf(before(MIN), now)).toEqual({ unit: "minutes", n: 1 })
  expect(elapsedOf(before(59 * MIN + 59_000), now)).toEqual({ unit: "minutes", n: 59 })
  expect(elapsedOf(before(HOUR), now)).toEqual({ unit: "hours", n: 1 })
  expect(elapsedOf(before(23 * HOUR + 59 * MIN), now)).toEqual({ unit: "hours", n: 23 })
})

test("それより前は暦の日: 前日は昨日、2〜6 日前は日、それより前は日付（年が違えば年も）", () => {
  expect(elapsedOf(new Date(2026, 9, 26, 9, 0), now)).toEqual({ unit: "yesterday" })
  expect(elapsedOf(new Date(2026, 9, 25, 23, 0), now)).toEqual({ unit: "days", n: 2 })
  expect(elapsedOf(new Date(2026, 9, 21, 0, 0), now)).toEqual({ unit: "days", n: 6 })
  expect(elapsedOf(new Date(2026, 9, 20, 12, 0), now)).toEqual({
    unit: "date",
    year: 2026,
    month: 10,
    day: 20,
    thisYear: true,
  })
  expect(elapsedOf(new Date(2025, 0, 2), now)).toMatchObject({ unit: "date", year: 2025, thisYear: false })
  expect(elapsedOf(new Date(2026, 9, 27, 14, 30).toISOString(), now)).toEqual({ unit: "minutes", n: 30 })
})
