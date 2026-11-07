// 鳥の絵に色を塗る純粋な計算（canvas に触れない。読み書きは paint.ts）。
// body は陰影と固定色の画素（RGBA）、mask は外羽・内羽・旗の割合（RGBA の R・G・B。0〜255 が 0〜1。足して 1 以下。A は見ない）。
// 塗る領域の body の R は陰影で、shade = R / 128。shade が 1 以下なら指定色に shade を掛け、1 を超えたら超えた分だけ白へ寄せる。
// 領域の外は body の色のまま。割合が中間の画素（縁）は、body の色と塗った色を割合で混ぜる
import type { BirdColors } from "./colors"

export type Rgb = readonly [number, number, number]

export function parseHex(hex: string): Rgb {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new TypeError(`色は #RRGGBB で指定してください: ${hex}`)
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb
}

const tint = (value: number, shade: number) =>
  shade <= 1 ? value * shade : value + (255 - value) * Math.min(1, shade - 1)

export function recolor(
  body: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  colors: BirdColors,
): Uint8ClampedArray<ArrayBuffer> {
  const targets = [parseHex(colors.feather), parseHex(colors.inner), parseHex(colors.flag)]
  const out = new Uint8ClampedArray(body)
  for (let i = 0; i < body.length; i += 4) {
    const weights = [(mask[i] as number) / 255, (mask[i + 1] as number) / 255, (mask[i + 2] as number) / 255]
    const total = (weights[0] as number) + (weights[1] as number) + (weights[2] as number)
    if (total === 0) continue
    const shade = (body[i] as number) / 128
    for (let c = 0; c < 3; c++) {
      let mixed = (body[i + c] as number) * Math.max(0, 1 - total)
      for (let k = 0; k < 3; k++) mixed += tint((targets[k] as Rgb)[c] as number, shade) * (weights[k] as number)
      out[i + c] = mixed
    }
  }
  return out
}
