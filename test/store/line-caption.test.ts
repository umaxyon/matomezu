// 線のキャプションの札の置き方（drawing/line/caption.ts）
import { expect, test } from "bun:test"
import { CAPTION_BOX_H, captionBox, clampCaptionOffset } from "../../web/src/plugins/books/drawing/line/caption"
import type { Pt } from "../../web/src/plugins/books/drawing/line/geom"

const center = (b: { x: number; y: number; w: number; h: number }) => [b.x + b.w / 2, b.y + b.h / 2]
const across = (to: number): Pt[] => [
  [160, 72],
  [to, 72],
]

test("線の真ん中に置く。幅は上限の 160（線の長さ 240 - 16 = 224 より狭い）", () => {
  const b = captionBox(across(400), {}, false)!
  expect([...center(b), b.w, b.h]).toEqual([280, 72, 160, CAPTION_BOX_H])
})

test("箱どうしが近いと、線の長さに合わせて狭く折り返す（下限は 48）", () => {
  expect(captionBox(across(240), {}, false)!.w).toBe(64) // 線は 80 → 80 - 16
  expect(captionBox(across(180), {}, false)!.w).toBe(48) // 線は 20 → 下限
})

test("その所の区間が縦向きの線と、自分に戻る線は、線の長さで狭めず上限の幅で折り返す", () => {
  const down: Pt[] = [
    [100, 104],
    [100, 140],
  ]
  expect(captionBox(down, {}, false)!.w).toBe(160)
  expect(captionBox(across(180), {}, true)!.w).toBe(160)
})

test("captionAt と captionOffset の位置に置く（右向きの線なら左は上）", () => {
  // 線は (160,72) から (400,72)。4 分の 1 は x=220、上へ 20
  expect(center(captionBox(across(400), { at: 0.25, offset: 20 }, false)!)).toEqual([220, 52])
})

test("線から離す量は ±60 まで。点が 2 つ未満なら置かない", () => {
  expect([clampCaptionOffset(90), clampCaptionOffset(-90), clampCaptionOffset(12)]).toEqual([60, -60, 12])
  expect(center(captionBox(across(400), { offset: 100 }, false)!)).toEqual([280, 12])
  expect(captionBox([[0, 0]], {}, false)).toBeNull()
})
