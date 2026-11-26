// 鳥の色の塗り（base/birds/recolor.ts）と、鳥の配色の定数（colors.ts）
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { BIRD_IDS } from "../../../web/src/plugins/base/birds"
import { BIRD_ORIGINAL, BIRD_PALETTES, birdColors } from "../../../web/src/plugins/base/birds/colors"
import { closeEyes, parseHex, recolor, recolorFace } from "../../../web/src/plugins/base/birds/recolor"
import { FACE_SIZE } from "../../../web/src/plugins/base/birds/sheets"

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

test("丸い顔: 固定色と 3 つの部分を透明度で重みを付けて混ぜ、透明度は足した値", () => {
  const fixed = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 0, 100, 100, 100, 128, 0, 0, 0, 0])
  const mask = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255, 0, 127, 0, 255, 0, 0, 0, 255])
  const out = recolorFace(fixed, mask, COLORS)
  expect(px(out, 0)).toEqual([10, 20, 30, 255])
  expect(px(out, 1)).toEqual([255, 0, 0, 255])
  expect(px(out, 2)).toEqual([50, 177, 50, 255])
  expect(px(out, 3)).toEqual([0, 0, 0, 0])
})

test("色は #RRGGBB から 3 つの値にする", () => {
  expect(parseHex("#0a1B2c")).toEqual([10, 27, 44])
})

test("鳥の配色: 20 個、id は重ならない。5 羽それぞれに元の配色があり、指定が無いか知らない id ではそれになる", () => {
  expect(BIRD_PALETTES).toHaveLength(20)
  expect(new Set(BIRD_PALETTES.map(p => p.id)).size).toBe(20)
  for (const bird of BIRD_IDS) {
    expect(birdColors(bird)).toEqual(BIRD_ORIGINAL[bird])
    expect(birdColors(bird, "nothing")).toEqual(BIRD_ORIGINAL[bird])
    expect(birdColors(bird, "navy")).toEqual(BIRD_PALETTES.find(p => p.id === "navy")?.colors as never)
    for (const c of Object.values(BIRD_ORIGINAL[bird])) parseHex(c)
  }
  for (const p of BIRD_PALETTES) for (const c of Object.values(p.colors)) parseHex(c)
})

describe("closeEyes", () => {
  // 一辺 48 の顔: 全体が明るい肌色（固定色）で、左右に暗い目（4×4）が 1 つずつ
  const size = 48
  const face = new Uint8ClampedArray(size * size * 4)
  const skin = [240, 230, 220, 255]
  const eye = [20, 20, 20, 255]
  const isEyeAt = (x: number, y: number) => y >= 23 && y <= 26 && ((x >= 12 && x <= 15) || (x >= 32 && x <= 35))
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) face.set(isEyeAt(x, y) ? eye : skin, (y * size + x) * 4)
  const closed = closeEyes(face, face, size)
  const px = (x: number, y: number) => [...closed.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)]

  test("目の上の方は肌色で埋め、下寄りに目の色の線を引く", () => {
    expect(px(13, 23)).toEqual(skin)
    expect(px(33, 23)).toEqual(skin)
    expect(px(13, 25)).toEqual(eye)
    expect(px(33, 26)).toEqual(eye)
  })

  test("目の外は変えない", () => {
    expect(px(5, 5)).toEqual(skin)
    expect(px(24, 25)).toEqual(skin)
  })
})

// 一辺 48 の顔の絵（PNG。RGB か RGBA、8 ビット、インターレース無し）の画素（RGBA）
function facePixels(path: string): Uint8ClampedArray {
  const b = readFileSync(path)
  let p = 8
  let width = 0
  let colorType = 0
  const idat: Buffer[] = []
  while (p < b.length) {
    const len = b.readUInt32BE(p)
    const type = b.toString("ascii", p + 4, p + 8)
    const d = b.subarray(p + 8, p + 8 + len)
    if (type === "IHDR") {
      width = d.readUInt32BE(0)
      colorType = d[9] as number
    }
    if (type === "IDAT") idat.push(d)
    p += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const height = raw.length / (stride + 1)
  const out = new Uint8ClampedArray(width * height * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? (cur[i - bpp] as number) : 0
      const up = prev[i] as number
      const c = i >= bpp ? (prev[i - bpp] as number) : 0
      const pa = Math.abs(up - c)
      const pb = Math.abs(a - c)
      const pc = Math.abs(a + up - 2 * c)
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][filter as number] as number
      cur[i] = ((raw[y * (stride + 1) + 1 + i] as number) + pred) & 255
    }
    for (let x = 0; x < width; x++)
      for (let k = 0; k < 4; k++) out[(y * width + x) * 4 + k] = k < bpp ? (cur[x * bpp + k] as number) : 255
    prev = cur
  }
  return out
}

test("closeEyes は、5 羽の顔の絵のどれでも、左右両方の目を見つけて閉じる（目を探す範囲が絵とずれていない）", () => {
  const dir = join(import.meta.dir, "../../../web/src/plugins/base/birds/images/faces")
  for (const bird of BIRD_IDS) {
    const fixed = facePixels(join(dir, `${bird}.png`))
    const mask = facePixels(join(dir, `${bird}-mask.png`))
    const face = recolorFace(fixed, mask, birdColors(bird))
    const closed = closeEyes(face, fixed, FACE_SIZE)
    let left = 0
    let right = 0
    for (let i = 0; i < face.length; i += 4)
      if (face.subarray(i, i + 4).some((v, k) => v !== closed[i + k])) {
        if ((i / 4) % FACE_SIZE < FACE_SIZE / 2) left++
        else right++
      }
    expect({ bird, left: left > 0, right: right > 0 }).toEqual({
      bird,
      left: true,
      right: true,
    })
  }
})
