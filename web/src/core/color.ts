// 色: テーマの代表色の名前（役割）と、色の値（#rrggbb）の読み書き・明るさ・色合いへの変換。
// 役割の名前は、どのテーマでもそのテーマの色で描く。役割は図を書くための枠で、意味を利用者に押し付けない（画面に名前は出さない。AI にだけ意味を見せる）

// 代表色の名前。並びは画面に出す順
export const PALETTE = ["primary", "secondary", "success", "warn", "danger", "muted"] as const
export type PaletteName = (typeof PALETTE)[number]

// AI に見せる、役割の意味（英語）
export const PALETTE_MEANINGS: Readonly<Record<PaletteName, string>> = {
  primary: "the main subject",
  secondary: "a supporting subject",
  success: "done, good",
  warn: "caution",
  danger: "a problem, danger",
  muted: "subdued",
}

export const isPaletteName = (v: unknown): v is PaletteName =>
  typeof v === "string" && (PALETTE as readonly string[]).includes(v)

// 色の値の書き方: #rrggbb
export const HEX = /^#[0-9a-fA-F]{6}$/

// 書かれた色の値（#rgb か #rrggbb。前後の空白は無視）を #rrggbb の小文字にする。読めなければ null
export function parseHex(text: string): string | null {
  const s = text.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map(c => c + c).join("")}`
  return HEX.test(s) ? s : null
}

function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// 明るい色か（明るい塗りの上には濃い文字、暗い塗りの上には白い文字を置く）
export function isLight(hex: string): boolean {
  const [r, g, b] = rgbOf(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
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
