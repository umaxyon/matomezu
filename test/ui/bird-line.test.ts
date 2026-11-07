// 線に付けた鳥の動き（base/birds/line.ts）: 歩くか周回かの判定、足元の位置と傾き、周回の姿
import { expect, test } from "bun:test"
import { orbitingPose } from "../../web/src/plugins/base/birds/flight"
import {
  footing,
  lengthOf,
  lineMotion,
  middleOf,
  ORBIT_FOOT,
  onSegment,
  orbitPose,
  simplified,
} from "../../web/src/plugins/base/birds/line"

const P = (x: number, y: number) => ({ x, y })

test("横向きの直線は歩く。左右どちらから始まる線も、左の端から右の端へ", () => {
  expect(lineMotion([P(10, 50), P(210, 50)])).toEqual({ kind: "walk", from: P(10, 50), to: P(210, 50) })
  expect(lineMotion([P(210, 52), P(10, 50)])).toEqual({ kind: "walk", from: P(10, 50), to: P(210, 52) })
})

test("途中の点が一直線上なら省いて、横向きの直線として歩く", () => {
  expect(simplified([P(0, 0), P(50, 0), P(100, 0)])).toEqual([P(0, 0), P(100, 0)])
  expect(lineMotion([P(0, 0), P(50, 0), P(100, 0)]).kind).toBe("walk")
})

test("傾きが 10° を超える線、縦の線、折れ線は周回する", () => {
  expect(lineMotion([P(0, 0), P(100, 20)]).kind).toBe("orbit")
  expect(lineMotion([P(0, 0), P(100, 17)]).kind).toBe("walk")
  expect(lineMotion([P(0, 0), P(0, 100)]).kind).toBe("orbit")
  expect(lineMotion([P(0, 0), P(100, 0), P(100, 60)]).kind).toBe("orbit")
  expect(lineMotion([P(0, 0), P(100, 0), P(0, 0)]).kind).toBe("orbit")
})

test("歩く足元: 歩く幅を線の真ん中に置き、その左端から x 進んだ線の上の点。傾きは線に合う", () => {
  const path = [P(0, 0), P(200, 20)]
  const motion = lineMotion(path)
  const angle = Math.atan(0.1)
  const length = Math.hypot(200, 20)
  const at = footing(path, motion, { x: 0, rotation: 0 }, 100, false)
  expect(at.x).toBeCloseTo(((length - 100) / 2) * Math.cos(angle), 5)
  expect(at.y).toBeCloseTo(at.x * 0.1, 5)
  expect(at.tilt).toBeCloseTo(angle, 5)
  const end = footing(path, motion, { x: 100, rotation: 0 }, 100, false)
  expect(Math.hypot(end.x, end.y)).toBeCloseTo((length - 100) / 2 + 100, 5)
})

test("動きを減らすときは、どの線でも真ん中に線の向きで立つ。縦の線は π/2", () => {
  const vertical = [P(10, 0), P(10, 100)]
  const at = footing(vertical, lineMotion(vertical), { x: 0, rotation: 0 }, 0, true)
  expect(at).toEqual({ x: 10, y: 50, tilt: Math.PI / 2 })
  const slanted = [P(0, 100), P(100, 0)]
  expect(footing(slanted, lineMotion(slanted), { x: 0, rotation: 0 }, 0, true).tilt).toBeCloseTo(-Math.PI / 4, 5)
})

test("折れ線の真ん中は、線の長さの半分の点", () => {
  const m = middleOf([P(0, 0), P(100, 0), P(100, 100)])
  expect(m.x).toBe(100)
  expect(m.y).toBe(0)
  expect(lengthOf([P(0, 0), P(3, 4)])).toBe(5)
  expect(onSegment(P(0, 0), P(10, 0), 4)).toEqual({ x: 4, y: 0, angle: 0 })
})

test("周回: 2 秒で一周し、手前を 3/4 の時間で回る。奥の端で透明になり、羽ばたきは 0 と 1 を行き来する", () => {
  expect(orbitPose(0).x).toBeCloseTo(orbitPose(2).x, 6)
  expect(orbitPose(0.1).frame).toBe(0)
  expect(orbitPose(0.2).frame).toBe(1)
  expect(orbitPose(0.4).frame).toBe(0)
  let front = 0
  let minOpacity = 1
  const N = 2000
  for (let i = 0; i < N; i++) {
    const o = orbitPose((i / N) * 2)
    if (o.scale > 0.17 + 0.83 * 0.5 ** 1.1) front++
    minOpacity = Math.min(minOpacity, o.opacity)
  }
  expect(front / N).toBeCloseTo(0.75, 1)
  expect(minOpacity).toBe(0)
})

test("周回の足元: 線の真ん中から体の中心の位置だけ離れ、体の下 ORBIT_FOOT×大きさにある", () => {
  const path = [P(0, 0), P(0, 100)]
  const motion = lineMotion(path)
  const pose = orbitingPose(3, "none", P(0, 0))
  const at = footing(path, motion, pose, 0, false)
  expect(at.y).toBeCloseTo(50 + (pose.hover?.y ?? 0) + ORBIT_FOOT * (pose.scale ?? 1) * Math.cos(pose.rotation), 5)
})

test("周回に入る前の飛来: 最初は画面の外から、降りる所へ近づく", () => {
  const start = orbitingPose(0, "fly", P(300, -200))
  expect(start.from).toEqual(P(300, -200))
  const later = orbitingPose(5, "fly", P(300, -200))
  expect(Math.hypot(later.from.x, later.from.y)).toBe(0)
  expect(Math.hypot(orbitingPose(0, "none", P(300, -200)).from.x, orbitingPose(0, "none", P(300, -200)).from.y)).toBe(0)
})
