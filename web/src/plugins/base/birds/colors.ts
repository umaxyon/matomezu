// 鳥の配色: 外羽・内羽・旗の 3 色の組。鳥の絵は陰影と 3 つの領域のマスクで持つので、この組を渡せば鳥が何色にでもなる（色を塗るのは paint.ts）。
// 鳥ごとの元の配色（BIRD_ORIGINAL）と、名前付きの 20 個の配色（BIRD_PALETTES）が定数で、鳥を描く所は配色の id を渡す（渡さなければ元の配色）
import type { Bird } from "."

export interface BirdColors {
  feather: string // 外羽: 頭・背中・翼・尾の主な色
  inner: string // 内羽: 顔からお腹などの明るい所
  flag: string // 旗の布
}

// 鳥ごとの元の配色。外羽が鳥の主な色（図のスキンのキャラクターの色）
export const BIRD_ORIGINAL: Readonly<Record<Bird, BirdColors>> = {
  tsunagidori: { feather: "#356650", inner: "#C9D0A2", flag: "#36A15A" },
  inko: { feather: "#7C2D60", inner: "#FBEAD6", flag: "#F63743" },
  buncho: { feather: "#45474B", inner: "#FFF1DE", flag: "#FFF9F3" },
  suzume: { feather: "#A84B28", inner: "#FAE6D6", flag: "#F6C631" },
  fukurou: { feather: "#303D73", inner: "#37BDBB", flag: "#247CFA" },
}

export interface BirdPalette {
  id: string
  name: string
  colors: BirdColors
}

const palette = (id: string, name: string, feather: string, inner: string, flag: string): BirdPalette => ({
  id,
  name,
  colors: { feather, inner, flag },
})

// 名前付きの 20 個の配色（どの鳥にも使える）
export const BIRD_PALETTES: readonly BirdPalette[] = [
  palette("forest", "フォレスト", "#235F3D", "#BFD7A4", "#267048"),
  palette("emerald", "エメラルド", "#2B8750", "#D8EFBC", "#39AE69"),
  palette("lime", "ライム", "#647E25", "#EDF0B7", "#A6CB38"),
  palette("olive", "オリーブ", "#676B23", "#E2E3B0", "#7E821E"),
  palette("sunflower", "サンフラワー", "#947028", "#FFF0B3", "#F0C534"),
  palette("orange", "オレンジ", "#BA6631", "#FFE2B8", "#EF8A32"),
  palette("vermilion", "バーミリオン", "#9D3F36", "#F8D7B9", "#D94838"),
  palette("pink", "ピンク", "#B05D79", "#FFE0EA", "#EF8CA8"),
  palette("magenta", "マゼンタ", "#92366C", "#F3D1E9", "#C4448D"),
  palette("plum", "プラム", "#573457", "#D8C8EF", "#74386C"),
  palette("lilac", "ライラック", "#8A73B6", "#F1E8FF", "#B5A1EA"),
  palette("violet", "バイオレット", "#6543A5", "#DAD5F7", "#7951C7"),
  palette("navy", "ネイビー", "#283D70", "#C6DEFA", "#304A8D"),
  palette("blue", "ブルー", "#2F69A8", "#D2EAF7", "#347FD0"),
  palette("sky", "スカイ", "#5B94AC", "#E5F3F3", "#87CDEA"),
  palette("deep-teal", "ディープティール", "#22575F", "#ABD8C8", "#236B75"),
  palette("turquoise", "ターコイズ", "#268C83", "#D0F0DA", "#31B9AF"),
  palette("chestnut", "チェスナット", "#69432F", "#EED3AB", "#855236"),
  palette("charcoal", "チャコール", "#3A3C44", "#DCE3EB", "#454852"),
  palette("cream", "クリーム", "#A69A76", "#FFF6DE", "#E9DDB6"),
]

// 鳥 bird の配色（palette は BIRD_PALETTES の id。無ければ元の配色）
export function birdColors(bird: Bird, paletteId?: string): BirdColors {
  return BIRD_PALETTES.find(p => p.id === paletteId)?.colors ?? BIRD_ORIGINAL[bird]
}
