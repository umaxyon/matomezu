// 鳥のマークの動き（birdPose）: 付けたときだけ飛んでくるか顔を出し、降りたあとは「付けたときの動き無し」と同じに、上の辺を往復して歩く
import { expect, test } from "bun:test"
import {
  type Arrival,
  birdPose,
  GAITS,
  VISIT_ARRIVE,
  visitLength,
  visitPose,
} from "../../web/src/plugins/base/birds/flight"

const SIZE = 48
const RANGE = 200
const FROM = { x: -300, y: -150 }
const ARRIVED: Record<Exclude<Arrival, "none">, number> = { fly: 2.5, peek: 4 } // 降りるまでの秒
// 足しても丸めの出ない刻み（降りるまでの秒を足して比べるため）
const times = Array.from({ length: 240 }, (_, i) => i * 0.125)

test("降りたあとは、付けたときの動きの無い鳥と同じ姿で歩く", () => {
  for (const gait of Object.values(GAITS))
    for (const [arrival, after] of Object.entries(ARRIVED))
      for (const t of times)
        expect(birdPose(after + t, arrival as Arrival, gait, SIZE, RANGE, FROM)).toEqual(
          birdPose(t, "none", gait, SIZE, RANGE, FROM),
        )
})

test("歩くあいだは、歩く所の中にいて、ずれも裏も無い", () => {
  for (const gait of Object.values(GAITS))
    for (const t of times) {
      const pose = birdPose(t, "none", gait, SIZE, RANGE, FROM)
      expect(pose.x).toBeGreaterThanOrEqual(0)
      expect(pose.x).toBeLessThanOrEqual(RANGE)
      expect(pose.lift).toBeLessThanOrEqual(0)
      expect([pose.from, pose.behind]).toEqual([{ x: 0, y: 0 }, false])
      expect(pose.frame).toBeGreaterThanOrEqual(8)
    }
})

test("飛んでくるときは画面の外から始まり、顔を出すときは物の裏の下から始まる", () => {
  const gait = GAITS.suzume
  expect(birdPose(0, "fly", gait, SIZE, RANGE, FROM)).toMatchObject({ from: FROM, behind: false, right: true })
  expect(birdPose(0, "peek", gait, SIZE, RANGE, FROM)).toMatchObject({ lift: SIZE, behind: true })
})

test("立ち寄る鳥は、飛んできて降り、仕草のコマを 1 回ずつ、その鳥の速さで見せてから正面を向いて止まる", () => {
  for (const g of Object.values(GAITS)) {
    const from = { x: -500, y: -300 }
    expect(visitPose(0, g, 48, 80, from)).toEqual(birdPose(0, "fly", g, 48, 80, from))
    const frames = [0, 1, 2, 3].map(i => visitPose(VISIT_ARRIVE + (i + 0.5) * g.step, g, 48, 80, from).frame)
    expect(frames).toEqual([12, 13, 14, 15])
    expect(visitPose(visitLength(g) + 0.01, g, 48, 80, from)).toMatchObject({ frame: 4, x: 80, from: { x: 0, y: 0 } })
    // 仕草は 1 秒くらい（鳥の速さで 0.9〜1.9 秒）
    expect(visitLength(g) - VISIT_ARRIVE).toBeGreaterThan(0.8)
    expect(visitLength(g) - VISIT_ARRIVE).toBeLessThan(2)
  }
})
