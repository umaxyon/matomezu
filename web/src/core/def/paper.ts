// 紙の定義: ページに置く紙の大きさ。大きさは縦に置いたときの値（w ≦ h）で、向き（縦・横）はページが持つ。
// 大きさは 96dpi で印刷したときの px
import type { PaperExtras } from "../catalog"
import type { Size } from "../geom"
import type { MessageKey } from "../i18n/i18n"

export const ORIENTATIONS = ["portrait", "landscape"] as const
export type Orientation = (typeof ORIENTATIONS)[number]

// 可変ページで利用者が選べる増やす向き（右と下・右だけ・下だけ・上下左右。ページの grows に持つ）
export const GROW_CHOICES = ["right-down", "right", "down", "all"] as const
export type GrowChoice = (typeof GROW_CHOICES)[number]

export interface PaperDef extends PaperExtras {
  id: string
  title: MessageKey
  size: Size
}

export function definePaper<const T extends PaperDef>(def: T): T {
  return def
}
