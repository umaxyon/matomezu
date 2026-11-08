// 参加者の記録の鳥（文字）を鳥の id にする。鳥ごとの元の配色の id
import { BIRD_IDS, type Bird } from "../birds"
import { BIRD_PALETTES } from "../birds/colors"

export const asBird = (bird: string | undefined): Bird | null => BIRD_IDS.find(b => b === bird) ?? null

// 鳥 bird の元の配色の id
export const originalPalette = (bird: Bird): string => BIRD_PALETTES.find(p => p.bird === bird)?.id ?? ""

// 配色の名前の文言の鍵（画面に出すときは t() を通す）
export const PALETTE_TITLES = {
  "tsunagidori-green": "Tsunagidori Green",
  "inko-red": "Parakeet Red",
  "buncho-white": "Java Sparrow White",
  "suzume-yellow": "Sparrow Yellow",
  "fukurou-blue": "Owl Blue",
  forest: "Forest",
  lime: "Lime",
  olive: "Olive",
  orange: "Orange",
  pink: "Pink",
  magenta: "Magenta",
  plum: "Plum",
  lilac: "Lilac",
  violet: "Violet",
  navy: "Navy",
  sky: "Sky",
  "deep-teal": "Deep Teal",
  turquoise: "Turquoise",
  chestnut: "Chestnut",
  charcoal: "Charcoal",
} as const
