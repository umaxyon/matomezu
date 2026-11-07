// 鳥の配色: 外羽・内羽・旗の 3 色の組。鳥の絵は陰影と 3 つの領域のマスクで持つので、この組を渡せば鳥が何色にでもなる（色を塗るのは paint.tsx）。
// 名前の付いた 20 個の配色（BIRD_PALETTES）が定数で、先頭の 5 つは 5 羽それぞれの元の配色。鳥を描く所は配色の id を渡す（渡さなければ、その鳥の元の配色）
import type { Bird } from "."

export interface BirdColors {
  feather: string // 外羽: 頭・背中・翼・尾の主な色
  inner: string // 内羽: 顔からお腹などの明るい所
  flag: string // 旗の布（丸い顔の背景も）
}

export interface BirdPalette {
  id: string
  name: string
  colors: BirdColors
  bird?: Bird // その鳥の元の配色なら、その鳥
}

const palette = (id: string, name: string, feather: string, inner: string, flag: string, bird?: Bird): BirdPalette => ({
  id,
  name,
  colors: { feather, inner, flag },
  ...(bird ? { bird } : {}),
})

export const BIRD_PALETTES: readonly BirdPalette[] = [
  palette("tsunagidori-green", "ツナギドリ・グリーン", "#52765A", "#C9D0A2", "#36A15A", "tsunagidori"),
  palette("inko-red", "インコ・レッド", "#873968", "#FBEAD6", "#F63743", "inko"),
  palette("buncho-white", "文鳥・ホワイト", "#434343", "#FFF1DE", "#FFF9F3", "buncho"),
  palette("suzume-yellow", "スズメ・イエロー", "#B74D29", "#FAE6D6", "#F6C631", "suzume"),
  palette("fukurou-blue", "フクロウ・ブルー", "#233C76", "#37BDBB", "#247CFA", "fukurou"),
  palette("forest", "フォレスト", "#235F3D", "#BFD7A4", "#267048"),
  palette("lime", "ライム", "#647E25", "#EDF0B7", "#A6CB38"),
  palette("olive", "オリーブ", "#676B23", "#E2E3B0", "#7E821E"),
  palette("orange", "オレンジ", "#BA6631", "#FFE2B8", "#EF8A32"),
  palette("pink", "ピンク", "#B05D79", "#FFE0EA", "#EF8CA8"),
  palette("magenta", "マゼンタ", "#92366C", "#F3D1E9", "#C4448D"),
  palette("plum", "プラム", "#573457", "#D8C8EF", "#74386C"),
  palette("lilac", "ライラック", "#8A73B6", "#F1E8FF", "#B5A1EA"),
  palette("violet", "バイオレット", "#6543A5", "#DAD5F7", "#7951C7"),
  palette("navy", "ネイビー", "#283D70", "#C6DEFA", "#304A8D"),
  palette("sky", "スカイ", "#5B94AC", "#E5F3F3", "#87CDEA"),
  palette("deep-teal", "ディープティール", "#22575F", "#ABD8C8", "#236B75"),
  palette("turquoise", "ターコイズ", "#268C83", "#D0F0DA", "#31B9AF"),
  palette("chestnut", "チェスナット", "#69432F", "#EED3AB", "#855236"),
  palette("charcoal", "チャコール", "#3A3C44", "#DCE3EB", "#454852"),
]

// 鳥ごとの元の配色
export const BIRD_ORIGINAL = Object.fromEntries(
  BIRD_PALETTES.flatMap(p => (p.bird ? [[p.bird, p.colors]] : [])),
) as Readonly<Record<Bird, BirdColors>>

// 鳥 bird の配色（palette は BIRD_PALETTES の id。無ければ、その鳥の元の配色）
export function birdColors(bird: Bird, paletteId?: string): BirdColors {
  return BIRD_PALETTES.find(p => p.id === paletteId)?.colors ?? BIRD_ORIGINAL[bird]
}
