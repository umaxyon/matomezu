// 紙の定義: ページに置く紙の大きさ。大きさは縦に置いたときの値（w ≦ h）で、向き（縦・横）はページが持つ。
// 大きさは 96dpi で印刷したときの px
import type { Size } from "../geom"
import type { MessageKey } from "../i18n/i18n"

export const ORIENTATIONS = ["portrait", "landscape"] as const
export type Orientation = (typeof ORIENTATIONS)[number]
export const ORIENTATION_TITLES: Readonly<Record<Orientation, MessageKey>> = { portrait: "縦", landscape: "横" }

export interface PaperDef {
  id: string
  title: MessageKey
  size: Size
}

export function definePaper<const T extends PaperDef>(def: T): T {
  return def
}
