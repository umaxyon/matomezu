// スライドのアイテム: 文字枠・自由な線・直線・楕円。ブックのアイテム（箱や線）とは別の、絵を描く道具の仲間。
// 置き場はページの slide（ブックのタイプが選ぶ）で、押し合わず、線もつながず、紙をはみ出てもよい（紙は表示の範囲）。能力（capabilities）は持たない。
// 線の点は、枠（幅と高さ）の中の割合（0 から 1）で持つ。枠を拡大すれば線も一緒に拡大する。
// 角度（rotation）・比率のロック（lockRatio）・元の比率（ratio。置いたときの幅 ÷ 高さ）は、どのアイテムも持つ
import { z } from "zod"
import { ColorSchema } from "../../base"
import { kit } from "./kit"

// どのアイテムも持つ項目
const FRAME = {
  rotation: z
    .number()
    .min(-360)
    .max(360)
    .optional()
    .describe("Angle in degrees, clockwise, around the center. Without it, 0"),
  lockRatio: z.literal(true).optional().describe("Resizing keeps the width : height ratio"),
  ratio: z
    .number()
    .positive()
    .optional()
    .describe("The width ÷ height the item was placed with (reset-ratio goes back to it)"),
}

// 枠の中の点（枠の左上が 0, 0、右下が 1, 1）
export const PointSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })

// 線の項目（色・太さ・点線）
const STROKE = {
  color: ColorSchema.optional().describe("Line color (a palette name or #rrggbb). Without it, the text color"),
  width: z.number().positive().max(200).optional().describe("Line width in pixels. Without it, 2"),
  dash: z.enum(["solid", "dashed"]).optional().describe("Without it, solid"),
}

export const TextFrameProps = z.strictObject({
  text: z.string().max(2000),
  fontSize: z.number().min(1).max(1000).optional().describe("Text size in pixels. Without it, 24"),
  align: z.enum(["left", "center", "right"]).optional().describe("Without it, left"),
  color: ColorSchema.optional().describe("Text color. Without it, the text color of the theme"),
  ...FRAME,
})

export const FreeLineProps = z.strictObject({
  points: z.array(PointSchema).min(2).max(500).describe("The line's points in order, as fractions of the frame"),
  ...STROKE,
  ...FRAME,
})

export const StraightLineProps = z.strictObject({
  from: PointSchema.optional().describe("Start, as a fraction of the frame. Without it, the top-left corner"),
  to: PointSchema.optional().describe("End, as a fraction of the frame. Without it, the bottom-right corner"),
  endHead: z.enum(["none", "arrow"]).optional().describe("A head at the end. Without it, none"),
  ...STROKE,
  ...FRAME,
})

export const EllipseProps = z.strictObject({
  fill: ColorSchema.optional().describe("Fill color. Without it, no fill"),
  stroke: ColorSchema.optional().describe("Outline color. Without it, the text color"),
  width: z.number().min(0).max(200).optional().describe("Outline width in pixels (0 for none). Without it, 2"),
  ...FRAME,
})

// 文字枠の文字の大きさ（px）の既定
export const DEFAULT_FONT_SIZE = 24

const MIN = { w: 8, h: 8 } as const

export const TEXT_FRAME = kit.defineShape({
  id: "slide-text",
  kind: "shape",
  version: 1,
  title: "Text frame",
  capabilities: [],
  toolbox: true,
  props: TextFrameProps,
  tokens: [],
  size: { w: 240, h: 48 },
  min: MIN,
})

export const FREE_LINE = kit.defineShape({
  id: "slide-free-line",
  kind: "shape",
  version: 1,
  title: "Free line",
  capabilities: [],
  toolbox: true,
  props: FreeLineProps,
  tokens: [],
  size: { w: 160, h: 80 },
  min: MIN,
})

export const STRAIGHT_LINE = kit.defineShape({
  id: "slide-line",
  kind: "shape",
  version: 1,
  title: "Straight line",
  capabilities: [],
  toolbox: true,
  props: StraightLineProps,
  tokens: [],
  size: { w: 160, h: 80 },
  min: MIN,
})

export const ELLIPSE = kit.defineShape({
  id: "slide-ellipse",
  kind: "shape",
  version: 1,
  title: "Ellipse",
  capabilities: [],
  toolbox: true,
  props: EllipseProps,
  tokens: [],
  size: { w: 160, h: 100 },
  min: MIN,
})

export const SLIDE_ITEMS = [TEXT_FRAME, FREE_LINE, STRAIGHT_LINE, ELLIPSE] as const
