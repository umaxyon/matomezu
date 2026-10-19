import { describe, expect, test } from "bun:test"
import { clampPan, contentSize, MARGIN, paperOrigin } from "../../web/src/core/viewport"

describe("clampPan", () => {
  const paper = { w: 1000, h: 600 }
  const content = contentSize(paper, 1)

  test("中身に余白を足す", () => {
    expect(content).toEqual({ w: 1000 + 2 * MARGIN, h: 600 + 2 * MARGIN })
  })

  test("表示領域に収まる向きは真ん中に置き、ずらせない", () => {
    const view = { w: content.w + 200, h: content.h + 100 }
    expect(clampPan(view, content, { x: -50, y: 30 })).toEqual({ x: 100, y: 50 })
  })

  test("収まらない向きは、中身の端が表示領域の内側に入らない範囲でだけずらせる", () => {
    const view = { w: 400, h: 300 }
    expect(clampPan(view, content, { x: 10, y: 10 })).toEqual({ x: 0, y: 0 })
    expect(clampPan(view, content, { x: -5000, y: -5000 })).toEqual({ x: 400 - content.w, y: 300 - content.h })
    expect(clampPan(view, content, { x: -100, y: -50 })).toEqual({ x: -100, y: -50 })
  })

  test("紙は中身の左上から余白の分だけ内側", () => {
    expect(paperOrigin({ x: -10, y: 5 })).toEqual({ x: MARGIN - 10, y: MARGIN + 5 })
  })
})
