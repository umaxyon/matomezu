// 鳥のマークの動き（birdPose）: 付けたときだけ飛んでくるか顔を出し、降りたあとは「付けたときの動き無し」と同じに、上の辺を往復して歩く
import { expect, test } from "bun:test"
import { type Arrival, birdPose, GAITS } from "../../web/src/plugins/base/birds/flight"

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
