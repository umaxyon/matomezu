// スライドのアイテムの枠の計算: つまみで大きさを変えたあとの枠（向かいの辺が紙の上で動かない。傾いていても）、回すつまみの角度、ドラッグで描いた線の枠
import { expect, test } from "bun:test"
import {
  centerOf,
  cornersOf,
  drawnRect,
  normalizeAngle,
  resizedRect,
  rotatedTo,
  thinned,
} from "../web/src/plugins/items/slide/rect"

const F = { x: 100, y: 50, w: 200, h: 100 }
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6)

test("傾いていない枠: 右の辺は幅だけ、左上の角は向かいの角（右下）を動かさずに広がる", () => {
  const right = resizedRect(F, 0, { right: true }, { x: 30, y: 99 }, 8)
  expect(right).toMatchObject({ x: 100, y: 50, w: 230, h: 100, scaled: false })
  const corner = resizedRect(F, 0, { left: true, top: true }, { x: -20, y: -10 }, 8)
  expect(corner).toMatchObject({ x: 80, y: 40, w: 220, h: 110, scaled: true })
})

test("下限より小さくならない", () => {
  const r = resizedRect(F, 0, { right: true }, { x: -500, y: 0 }, 8)
  expect(r.w).toBe(8)
  expect(r.x).toBe(100)
  const l = resizedRect(F, 0, { left: true }, { x: 500, y: 0 }, 8)
  expect(l.w).toBe(8)
  expect(l.x + l.w).toBe(300)
})

test("比を保つ: 角は幅に合わせて高さを決める。辺は縦の真ん中を保つ", () => {
  const corner = resizedRect(F, 0, { right: true, bottom: true }, { x: 100, y: 0 }, 8, 2)
  expect(corner).toMatchObject({ x: 100, y: 50, w: 300, h: 150 })
  const edge = resizedRect(F, 0, { right: true }, { x: 100, y: 0 }, 8, 2)
  expect(edge).toMatchObject({ x: 100, w: 300, h: 150 })
  close(edge.y + edge.h / 2, 100)
})

test("傾いた枠: 向かいの角が紙の上で動かない", () => {
  for (const rotation of [30, 90, -45, 180]) {
    const before = cornersOf(F, rotation)
    const to = resizedRect(F, rotation, { right: true, bottom: true }, { x: 17, y: 23 }, 8)
    const after = cornersOf(to, rotation)
    close(after[0]?.x ?? 0, before[0]?.x ?? 0)
    close(after[0]?.y ?? 0, before[0]?.y ?? 0)
    const left = resizedRect(F, rotation, { left: true, top: true }, { x: -9, y: 4 }, 8)
    const fixed = cornersOf(left, rotation)[2]
    close(fixed?.x ?? 0, before[2]?.x ?? 0)
    close(fixed?.y ?? 0, before[2]?.y ?? 0)
  }
})

test("回すつまみ: 中心のまわりに動いた分だけ回り、snap があればその倍数に丸める。-180 を超え 180 以下にそろえる", () => {
  const c = centerOf(F)
  const start = { x: c.x + 100, y: c.y }
  close(rotatedTo(0, c, start, { x: c.x, y: c.y + 100 }), 90)
  close(rotatedTo(10, c, start, { x: c.x, y: c.y + 100 }), 100)
  expect(rotatedTo(0, c, start, { x: c.x + 100, y: c.y + 20 }, 15)).toBe(15)
  expect(normalizeAngle(270)).toBe(-90)
  expect(normalizeAngle(-180)).toBe(180)
  expect(normalizeAngle(360)).toBe(0)
})

test("ドラッグで描いた線: 点を枠の中の割合にし、水平・垂直の線は下限の太さの枠に入れる", () => {
  const free = drawnRect(
    [
      { x: 10, y: 20 },
      { x: 110, y: 70 },
    ],
    8,
  )
  expect(free.rect).toEqual({ x: 10, y: 20, w: 100, h: 50 })
  expect(free.fractions).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ])
  const flat = drawnRect(
    [
      { x: 0, y: 5 },
      { x: 40, y: 5 },
    ],
    8,
  )
  expect(flat.rect.h).toBe(8)
  expect(flat.fractions.map(p => p.y)).toEqual([0, 0])
})

test("点の間引き: 近い点を捨て、最後の点は残す", () => {
  const pts = [0, 1, 2, 3, 10, 11].map(x => ({ x, y: 0 }))
  expect(thinned(pts, 5).map(p => p.x)).toEqual([0, 10, 11])
})
