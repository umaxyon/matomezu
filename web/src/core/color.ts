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

// #rrggbb の赤・緑・青（0〜255）
export function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// 明るい色か（明るい塗りの上には濃い文字、暗い塗りの上には白い文字を置く）
export function isLight(hex: string): boolean {
  const [r, g, b] = rgbOf(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}
