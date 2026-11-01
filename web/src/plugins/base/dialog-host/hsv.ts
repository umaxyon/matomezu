// 色の選び方の計算（色の選び方のポップアップが使う）: 書かれた色の値を読む、#rrggbb と色合い・濃さ・明るさの行き来
import { HEX, rgbOf } from "../../../core/color"

// 書かれた色の値（#rgb か #rrggbb。前後の空白は無視）を #rrggbb の小文字にする。読めなければ null
export function parseHex(text: string): string | null {
  const s = text.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map(c => c + c).join("")}`
  return HEX.test(s) ? s : null
}

// 色合い（0〜360）・濃さ（0〜1）・明るさ（0〜1）
export interface Hsv {
  h: number
  s: number
  v: number
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = rgbOf(hex).map(c => c / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  const hex2 = (n: number) =>
    Math.round(Math.min(255, Math.max(0, (n + m) * 255)))
      .toString(16)
      .padStart(2, "0")
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}
