// 親から子への線の形: 直線・折れ線（伸びる向きに半分進んで曲がる、組織図の形）・曲線（マインドマップの形）。
// ブックとページの設定の項目で持ち、ページはブックを継承できる。道筋は線の両端と伸びる向きから決める（treePath）
import { z } from "zod"
import type { Point } from "../../../plugin-api"
import { kit } from "./kit"
import type { Side } from "./node"

export const LINE_SHAPES = ["straight", "elbow", "curve"] as const
export type LineShape = (typeof LINE_SHAPES)[number]

// 何も選んでいないときの形
export const DEFAULT_LINE_SHAPE: LineShape = "straight"

export const LINE_SHAPE = kit.defineSetting({
  id: "line-shape",
  title: "Line shape",
  schema: z.enum(LINE_SHAPES),
  default: DEFAULT_LINE_SHAPE,
})

// 線（from から to へ、side の向きに伸びる枝の線）を、形 shape で描く SVG の道筋
export function treePath(line: { from: Point; to: Point; side: Side }, shape: LineShape): string {
  const { from: f, to: t, side } = line
  const vertical = side === "up" || side === "down"
  if (shape === "straight") return `M${f.x},${f.y} L${t.x},${t.y}`
  if (vertical) {
    const mid = (f.y + t.y) / 2
    return shape === "elbow"
      ? `M${f.x},${f.y} V${mid} H${t.x} V${t.y}`
      : `M${f.x},${f.y} C${f.x},${mid} ${t.x},${mid} ${t.x},${t.y}`
  }
  const mid = (f.x + t.x) / 2
  return shape === "elbow"
    ? `M${f.x},${f.y} H${mid} V${t.y} H${t.x}`
    : `M${f.x},${f.y} C${mid},${f.y} ${mid},${t.y} ${t.x},${t.y}`
}
