// スライドのアイテムのビュー: 文字枠・自由な線・直線・楕円。枠いっぱい（size）に描く。角度は見せ方が枠にかけるので、ここでは傾けない。
// 線の点は枠の中の割合なので、枠の大きさを掛けて描く。色は代表色の名前か #rrggbb（base の colorPaint）で、無ければテーマの文字の色

import type { z } from "zod"
import type { ItemViewProps } from "../../../plugin-api/ui"
import { colorPaint } from "../../base"
import {
  DEFAULT_FONT_SIZE,
  type EllipseProps,
  type FreeLineProps,
  type StraightLineProps,
  type TextFrameProps,
} from "./slide"

const INK = "var(--theme-text)"
const paint = (color: string | undefined): string => (color === undefined ? INK : colorPaint(color).fill)
const WIDTH = 2

export function TextFrameView({ props, size }: ItemViewProps<z.output<typeof TextFrameProps>>) {
  return (
    <div
      style={{
        width: size.w,
        height: size.h,
        overflow: "hidden",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        fontSize: props.fontSize ?? DEFAULT_FONT_SIZE,
        lineHeight: 1.3,
        textAlign: props.align ?? "left",
        color: paint(props.color),
      }}
    >
      {props.text}
    </div>
  )
}

function Strokes({
  size,
  points,
  color,
  width,
  dash,
  head,
}: {
  size: { w: number; h: number }
  points: readonly { x: number; y: number }[]
  color: string | undefined
  width: number | undefined
  dash: string | undefined
  head?: boolean
}) {
  const at = points.map(p => `${p.x * size.w},${p.y * size.h}`).join(" ")
  const [a, b] = [points.at(-2), points.at(-1)]
  const arrow =
    head && a && b ? arrowHead(a.x * size.w, a.y * size.h, b.x * size.w, b.y * size.h, (width ?? WIDTH) * 4) : null
  return (
    <svg width={size.w} height={size.h} style={{ overflow: "visible", display: "block" }} aria-hidden="true">
      <polyline
        points={at}
        fill="none"
        stroke={paint(color)}
        strokeWidth={width ?? WIDTH}
        strokeDasharray={dash === "dashed" ? `${(width ?? WIDTH) * 4} ${(width ?? WIDTH) * 3}` : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {arrow && <polygon points={arrow} fill={paint(color)} />}
    </svg>
  )
}

// 終点 (x2, y2) に付ける三角（長さ len）の頂点
function arrowHead(x1: number, y1: number, x2: number, y2: number, len: number): string | null {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  if (Number.isNaN(angle)) return null
  const side = (turn: number) => `${x2 - len * Math.cos(angle + turn)},${y2 - len * Math.sin(angle + turn)}`
  return `${x2},${y2} ${side(Math.PI / 7)} ${side(-Math.PI / 7)}`
}

export function FreeLineView({ props, size }: ItemViewProps<z.output<typeof FreeLineProps>>) {
  return <Strokes size={size} points={props.points} color={props.color} width={props.width} dash={props.dash} />
}

export function StraightLineView({ props, size }: ItemViewProps<z.output<typeof StraightLineProps>>) {
  const points = [props.from ?? { x: 0, y: 0 }, props.to ?? { x: 1, y: 1 }]
  return (
    <Strokes
      size={size}
      points={points}
      color={props.color}
      width={props.width}
      dash={props.dash}
      head={props.endHead === "arrow"}
    />
  )
}

export function EllipseView({ props, size }: ItemViewProps<z.output<typeof EllipseProps>>) {
  const width = props.width ?? WIDTH
  return (
    <svg width={size.w} height={size.h} style={{ overflow: "visible", display: "block" }} aria-hidden="true">
      <ellipse
        cx={size.w / 2}
        cy={size.h / 2}
        rx={Math.max(size.w / 2 - width / 2, 0)}
        ry={Math.max(size.h / 2 - width / 2, 0)}
        fill={props.fill === undefined ? "none" : paint(props.fill)}
        stroke={width > 0 ? paint(props.stroke) : "none"}
        strokeWidth={width}
      />
    </svg>
  )
}
