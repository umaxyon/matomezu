// 紙の型。大きさは 96dpi で印刷したときの px
import type { Size } from "./geom"
import type { MessageKey } from "./i18n/i18n"

export const PAPERS = {
  "a5-portrait": { w: 559, h: 794, title: "A5 縦" },
  "a5-landscape": { w: 794, h: 559, title: "A5 横" },
  "a4-portrait": { w: 794, h: 1123, title: "A4 縦" },
  "a4-landscape": { w: 1123, h: 794, title: "A4 横" },
  "a3-portrait": { w: 1123, h: 1587, title: "A3 縦" },
  "a3-landscape": { w: 1587, h: 1123, title: "A3 横" },
} as const satisfies Record<string, Size & { title: MessageKey }>

export type PaperName = keyof typeof PAPERS
export const PAPER_NAMES = Object.keys(PAPERS) as [PaperName, ...PaperName[]]

// 紙の選び方の規定。ページは allowed の中から選び、選ばなければ default。
// perPage が false なら、1 冊の紙は最初のページで決まり、後のページも同じ紙にする
export interface PaperRule {
  allowed: readonly PaperName[]
  default: PaperName
  perPage: boolean
}
