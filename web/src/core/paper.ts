// 紙の型。大きさは 96dpi で印刷したときの px
import type { Size } from "./geom";

export const PAPERS = {
  "a5-portrait": { w: 559, h: 794 },
  "a5-landscape": { w: 794, h: 559 },
  "a4-portrait": { w: 794, h: 1123 },
  "a4-landscape": { w: 1123, h: 794 },
  "a3-portrait": { w: 1123, h: 1587 },
  "a3-landscape": { w: 1587, h: 1123 },
} as const satisfies Record<string, Size>;

export type PaperName = keyof typeof PAPERS;
export const DEFAULT_PAPER: PaperName = "a4-landscape";
