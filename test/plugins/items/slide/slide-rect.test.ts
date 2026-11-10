// スライドのアイテムの枠の計算: つまみで大きさを変えたあとの枠（向かいの辺が紙の上で動かない。傾いていても）、回すつまみの角度、ドラッグで描いた線の枠
import { expect, test } from "bun:test"
import {
  boundsOf,
  centerOf,
  cornersOf,
  drawnRect,
  fittedRect,
  movedPoint,
  normalizeAngle,
  pointsOnPaper,
  resizedRect,
  rotatedTo,
  snappedTo45,
  spanOf,
  thinned,
  touches,
  unionOf,
} from "../../../../web/src/plugins/items/slide/rect"

const F = { x: 100, y: 50, w: 200, h: 100 }
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6)

test("傾いていない枠: 右の辺は幅だけ、左上の角は向かいの角（右下）を動かさずに広がる", () => {
  const right = resizedRect(F, 0, { right: true }, { x: 30, y: 99 }, 8)
  expect(right).toMatchObject({ x: 100, y: 50, w: 230, h: 100, scaled: false })
  const corner = resizedRect(F, 0, { left: true, top: true }, { x: -20, y: -10 }, 8)
  expect(corner).toMatchObject({ x: 80, y: 40, w: 220, h: 110, scaled: true })
})

test("square なら、角を引くと縦横の長い方に揃い、向かいの角は動かない。辺は揃えない", () => {
  const corner = resizedRect(F, 0, { left: true, top: true }, { x: -20, y: -10 }, 8, true)
  expect(corner).toMatchObject({ x: 80, y: -70, w: 220, h: 220 })
  const side = resizedRect(F, 0, { right: true }, { x: 30, y: 0 }, 8, true)
  expect(side).toMatchObject({ w: 230, h: 100 })
})

test("下限より小さくならない", () => {
  const r = resizedRect(F, 0, { right: true }, { x: -500, y: 0 }, 8)
  expect(r.w).toBe(8)
  expect(r.x).toBe(100)
  const l = resizedRect(F, 0, { left: true }, { x: 500, y: 0 }, 8)
  expect(l.w).toBe(8)
  expect(l.x + l.w).toBe(300)
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

test("傾けた四角を囲む四角・四角の全体・ドラッグ枠の四角・重なり", () => {
  const b = boundsOf({ x: 0, y: 0, w: 100, h: 100 }, 45)
  close(b.w, Math.SQRT2 * 100)
  close(b.x, 50 - (Math.SQRT2 * 100) / 2)
  expect(unionOf([])).toBeNull()
  expect(unionOf([F, { x: 0, y: 0, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 300, h: 150 })
  expect(spanOf({ x: 5, y: 9 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 2, w: 4, h: 7 })
  expect(touches(F, { x: 300, y: 150, w: 10, h: 10 })).toBe(true) // 角が触れる
  expect(touches(F, { x: 301, y: 50, w: 10, h: 10 })).toBe(false)
})

test("線の点を動かすと、枠は点の範囲に合い、点は枠の割合で持ち直す。傾けた線は、見た目のまま角度なしになる", () => {
  const rect = { x: 100, y: 100, w: 200, h: 100 }
  const line = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]
  const moved = movedPoint(rect, 0, line, 1, { x: 400, y: 300 }, 8)
  expect(moved.rect).toEqual({ x: 100, y: 100, w: 300, h: 200 })
  expect(moved.points).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ])
  // 動かしていない点の紙の上の位置は変わらない（傾けた線でも）
  const turned = movedPoint(rect, 90, line, 0, { x: 0, y: 0 }, 8)
  const keep = pointsOnPaper(rect, 90, line)[1]!
  const after = pointsOnPaper(turned.rect, 0, turned.points)[1]!
  close(after.x, keep.x)
  close(after.y, keep.y)
  // 真横の線でも、枠の高さは下限を割らない
  expect(movedPoint(rect, 0, line, 1, { x: 300, y: 100 }, 8).rect.h).toBe(8)
})

test("45 度ずつに丸める: 水平・垂直・斜めに寄り、長さは保つ", () => {
  const from = { x: 0, y: 0 }
  const h = snappedTo45(from, { x: 100, y: 10 })
  close(h.y, 0)
  const v = snappedTo45(from, { x: 5, y: -80 })
  close(v.x, 0)
  const d = snappedTo45(from, { x: 60, y: 50 })
  close(d.x, d.y)
  close(Math.hypot(d.x, d.y), Math.hypot(60, 50))
})

test("文字に合わせた枠: 右と下が広がることも縮むこともあり、左上の角は紙の上で動かない", () => {
  expect(fittedRect(F, 0, { w: 260, h: 100 })).toEqual({ x: 100, y: 50, w: 260, h: 100 })
  expect(fittedRect(F, 0, { w: 200, h: 100 })).toBe(F) // 同じ大きさの要求では変えない
  expect(fittedRect(F, 0, { w: 40, h: 20 })).toEqual({ x: 100, y: 50, w: 40, h: 20 })
  const turned = fittedRect(F, 30, { w: 260, h: 140 })
  const [before] = cornersOf(F, 30)
  const [after] = cornersOf(turned, 30)
  close(after?.x ?? 0, before?.x ?? 1)
  close(after?.y ?? 0, before?.y ?? 1)
  expect(turned).toMatchObject({ w: 260, h: 140 })
})
