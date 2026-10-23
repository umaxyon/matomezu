// 線の端の形。DOM に依存しない。
// 端ごとの形は線の startHead / endHead に書く（書いた端に付く）。
// 描き方は、塗る形（fill）と線で描く形（stroke）の path と、見える線を端から縮める長さ（trim。形の付け根で線を止める）

import type { Point } from "../../../core/geom"

export const HEADS = [
  "arrow",
  "open",
  "hollow",
  "diamond",
  "hollowDiamond",
  "one",
  "many",
  "zeroOne",
  "zeroMany",
  "oneMany",
] as const
export type Head = (typeof HEADS)[number]

export interface HeadDraw {
  fill: string
  stroke: string
  trim: number
}

const r = (n: number) => Math.round(n * 10) / 10

// f から tip へ向かう区間の、tip の側の形。区間が短すぎれば何も描かない
export function headDraw(kind: Head, { x: fx, y: fy }: Point, { x: tx, y: ty }: Point): HeadDraw {
  const len = Math.hypot(tx - fx, ty - fy)
  if (len < 1) return { fill: "", stroke: "", trim: 0 }
  const ux = (tx - fx) / len,
    uy = (ty - fy) / len
  // 先端から軸に沿って d 戻り、横へ w ずれた点（w は進む向きの左が正）
  const at = (d: number, w = 0) => `${r(tx - ux * d - uy * w)},${r(ty - uy * d + ux * w)}`
  const tri = `M${at(0)}L${at(10, 6)}L${at(10, -6)}Z`
  const dia = `M${at(0)}L${at(8, 5)}L${at(16)}L${at(8, -5)}Z`
  const bar = (d: number) => `M${at(d, 6)}L${at(d, -6)}`
  const crow = (d: number) => `M${at(0, 7)}L${at(d)}L${at(0, -7)}M${at(0)}L${at(d)}`
  // 輪（中心は先端から d、半径 4）。線は輪の手前で止め、輪の先から先端までは stroke に描く
  const ring = (d: number) => `M${at(d - 4)}A4,4 0 1 1 ${at(d + 4)}A4,4 0 1 1 ${at(d - 4)}`
  switch (kind) {
    case "arrow":
      return { fill: tri, stroke: "", trim: 9 }
    case "hollow":
      return { fill: "", stroke: tri, trim: 10 }
    case "open":
      return { fill: "", stroke: `M${at(10, 6)}L${at(0)}L${at(10, -6)}`, trim: 0 }
    case "diamond":
      return { fill: dia, stroke: "", trim: 15 }
    case "hollowDiamond":
      return { fill: "", stroke: dia, trim: 16 }
    case "one":
      return { fill: "", stroke: bar(8), trim: 0 }
    case "many":
      return { fill: "", stroke: crow(11), trim: 11 }
    case "oneMany":
      return { fill: "", stroke: crow(11) + bar(15), trim: 11 }
    case "zeroOne":
      return { fill: "", stroke: `${bar(6)}M${at(0)}L${at(12)}${ring(16)}`, trim: 20 }
    case "zeroMany":
      return { fill: "", stroke: `${crow(11)}M${at(11)}L${at(13)}${ring(17)}`, trim: 21 }
  }
}
