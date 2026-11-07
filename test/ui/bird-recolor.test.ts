// 鳥の色の塗り（base/birds/recolor.ts）と、鳥の配色の定数（colors.ts）
import { expect, test } from "bun:test"
import { BIRD_IDS } from "../../web/src/plugins/base/birds"
import { BIRD_ORIGINAL, BIRD_PALETTES, birdColors } from "../../web/src/plugins/base/birds/colors"
import { parseHex, recolor } from "../../web/src/plugins/base/birds/recolor"

const COLORS = { feather: "#FF0000", inner: "#00FF00", flag: "#0000FF" }
const px = (a: Uint8ClampedArray, i: number) => [...a.slice(i * 4, i * 4 + 4)]

test("領域の外は元の色のまま。透明度は変えない", () => {
  const body = new Uint8ClampedArray([10, 20, 30, 200, 128, 128, 128, 0])
  const mask = new Uint8ClampedArray(8)
  expect(px(recolor(body, mask, COLORS), 0)).toEqual([10, 20, 30, 200])
  expect(px(recolor(body, mask, COLORS), 1)).toEqual([128, 128, 128, 0])
})

test("領域の中は、指定色に陰影を掛ける（128 で指定色そのまま、64 で半分、192 で半分だけ白へ）", () => {
  const body = new Uint8ClampedArray([128, 0, 0, 255, 64, 0, 0, 255, 192, 0, 0, 255])
  const mask = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255])
  const out = recolor(body, mask, COLORS)
  expect(px(out, 0)).toEqual([255, 0, 0, 255])
  expect(px(out, 1)).toEqual([128, 0, 0, 255])
  expect(px(out, 2).slice(0, 3)).toEqual([255, 128, 128])
})

test("内羽と旗はそれぞれ別の色。割合が半分の画素は元の色と混ぜる", () => {
  const body = new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255, 100, 100, 100, 255])
  const mask = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 128, 255])
  const out = recolor(body, mask, COLORS)
  expect(px(out, 0)).toEqual([0, 255, 0, 255])
  expect(px(out, 1)).toEqual([0, 0, 255, 255])
  const mixed = px(out, 2)
  expect(mixed[2]).toBeGreaterThan(70)
  expect(mixed[0]).toBeLessThan(60)
})

test("色は #RRGGBB だけ", () => {
  expect(parseHex("#0a1B2c")).toEqual([10, 27, 44])
  expect(() => parseHex("red")).toThrow(TypeError)
})

test("鳥の配色: 20 個、id は重ならない。指定が無いか知らない id は元の配色", () => {
  expect(BIRD_PALETTES).toHaveLength(20)
  expect(new Set(BIRD_PALETTES.map(p => p.id)).size).toBe(20)
  for (const bird of BIRD_IDS) {
    expect(birdColors(bird)).toEqual(BIRD_ORIGINAL[bird])
    expect(birdColors(bird, "nothing")).toEqual(BIRD_ORIGINAL[bird])
    expect(birdColors(bird, "blue")).toEqual(BIRD_PALETTES.find(p => p.id === "blue")?.colors as never)
    for (const c of Object.values(BIRD_ORIGINAL[bird])) parseHex(c)
  }
  for (const p of BIRD_PALETTES) for (const c of Object.values(p.colors)) parseHex(c)
})
