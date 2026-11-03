// 紙を急ぎ目になめらかにずらす（plugins/base/utils/glide-pan.ts）: コマごとに少しずつずらし、合計は頼んだ量にきっちりなる。また呼ぶと前の動きは止まる
import { expect, test } from "bun:test"
import { type GlideClock, glidePan } from "../../web/src/plugins/base/utils/glide-pan"

// 頼まれたコマを、時刻を 16ms ずつ進めながら順に回す時計
function fakeClock(still = false) {
  let time = 0
  const steps: ((now: number) => void)[] = []
  const clock: GlideClock = { frame: s => steps.push(s), now: () => time, still: () => still }
  const run = (frames = 100) => {
    for (let i = 0; i < frames && steps.length > 0; i++) {
      time += 16
      steps.shift()?.(time)
    }
  }
  return { clock, run }
}

test("コマごとにずらした量の合計は、頼んだ量にきっちりなる。動きを減らす設定なら 1 度にずらす", () => {
  const { clock, run } = fakeClock()
  const moves: [number, number][] = []
  glidePan((dx, dy) => moves.push([dx, dy]), 300, -120, clock)
  run()
  expect(moves.length).toBeGreaterThan(3)
  expect(moves.reduce((a, [x]) => a + x, 0)).toBeCloseTo(300, 9)
  expect(moves.reduce((a, [, y]) => a + y, 0)).toBeCloseTo(-120, 9)
  const once: [number, number][] = []
  glidePan((dx, dy) => once.push([dx, dy]), 300, -120, fakeClock(true).clock)
  expect(once).toEqual([[300, -120]])
})

test("動いている間にまた呼ぶと、前の動きはそこで止まる", () => {
  const first = fakeClock()
  const second = fakeClock()
  let a = 0
  let b = 0
  glidePan(dx => (a += dx), 300, 0, first.clock)
  first.run(2)
  const partway = a
  glidePan(dx => (b += dx), 100, 0, second.clock)
  first.run()
  second.run()
  expect(a).toBe(partway)
  expect(partway).toBeLessThan(300)
  expect(b).toBeCloseTo(100, 9)
})
