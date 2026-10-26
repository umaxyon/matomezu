// 形のアイコン（ツールボックスなどに出す）。輪郭は形の表（outline.ts）から 24×24 の中に描く（斜めの辺の食い込みは小さく）
import type { ReactNode } from "react"
import { SHAPE_RULES, type ShapeKind } from "./outline"
import { OutlineShape } from "./ShapeView"

const ICON_SIZE: Record<ShapeKind, { w: number; h: number }> = {
  rounded: { w: 20, h: 10 },
  diamond: { w: 20, h: 14 },
  parallelogram: { w: 20, h: 10 },
  "parallelogram-reversed": { w: 20, h: 10 },
  trapezoid: { w: 20, h: 10 },
  "trapezoid-reversed": { w: 20, h: 10 },
  hexagon: { w: 20, h: 12 },
  circle: { w: 14, h: 14 },
}

export function shapeIcon(kind: ShapeKind): ReactNode {
  const size = ICON_SIZE[kind]
  const inner = { w: size.w - 2, h: size.h - 2 }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g transform={`translate(${(24 - size.w) / 2} ${(24 - size.h) / 2})`}>
        <OutlineShape outline={SHAPE_RULES[kind].outline(inner, 4)} />
      </g>
    </svg>
  )
}
