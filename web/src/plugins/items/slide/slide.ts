// 描画シェイプ（SLIDE_ITEMS）。ページの items に置くアイテム（箱や線）とは別の物。
// 置き場はページの slide（ページのタイプが選ぶ）で、押し合わず、線もつながず、紙をはみ出てもよい（紙は表示の範囲）。ケイパビリティ（capabilities）は持たない。
// 線の点は、枠（幅と高さ）の中の割合（0 から 1）で持つ。枠を拡大すれば線も一緒に拡大する。
// 角度（rotation）は、どのアイテムも持つ
import { z } from "zod"
import { ColorSchema, type MinimapMark } from "../../base"
import { kit } from "./kit"

// どのアイテムも持つ項目
const FRAME = {
  rotation: z
    .number()
    .min(-360)
    .max(360)
    .optional()
    .describe("Angle in degrees, clockwise, around the center. Without it, 0"),
}

// 枠の中の点（枠の左上が 0, 0、右下が 1, 1）
export const PointSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })

// 線・楕円・長方形の枠の太さ（px）の既定と上限
export const DEFAULT_STROKE_WIDTH = 1
export const MAX_STROKE_WIDTH = 200

// 線の項目（色・太さ・点線）
const STROKE = {
  color: ColorSchema.optional().describe("Line color (a palette name or #rrggbb). Without it, the text color"),
  width: z
    .number()
    .positive()
    .max(MAX_STROKE_WIDTH)
    .optional()
    .describe(`Line width in pixels. Without it, ${DEFAULT_STROKE_WIDTH}`),
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

// 枠の色が「枠なし」を表す値（未設定は、文字色の枠）
export const NO_OUTLINE = "none"

// 楕円と長方形の項目（塗り・枠の色・枠の太さ）
export const FigureProps = z.strictObject({
  fill: ColorSchema.optional().describe("Fill color. Without it, no fill"),
  stroke: z
    .union([ColorSchema, z.literal(NO_OUTLINE)])
    .optional()
    .describe(`Outline color, or "${NO_OUTLINE}" for no outline. Without it, the text color`),
  width: z
    .number()
    .min(0)
    .max(MAX_STROKE_WIDTH)
    .optional()
    .describe(`Outline width in pixels (0 for none). Without it, ${DEFAULT_STROKE_WIDTH}`),
  ...FRAME,
})

// 線・文字・枠の色の「なし」（テーマの文字の色）。描くときも、色を選ぶ見本の「なし」も、これを使う。プラグインのテーマキー
export const SLIDE_INK = { id: kit.name("slide-ink"), fallback: "text" } as const

// 枠の中の点（0 から 1 の割合）
export type FractionPoint = z.output<typeof PointSchema>

// 直線の端の点の既定（枠の左上と右下）
const LINE_FROM: FractionPoint = { x: 0, y: 0 }
const LINE_TO: FractionPoint = { x: 1, y: 1 }

// 線の点: 直線は両端、自由な線はすべての点（線でないアイテムは無し）
export function linePointsOf(kind: string, props: Readonly<Record<string, unknown>>): readonly FractionPoint[] {
  if (kind === FREE_LINE.id) return (props.points as FractionPoint[] | undefined) ?? []
  if (kind === STRAIGHT_LINE.id)
    return [(props.from as FractionPoint | undefined) ?? LINE_FROM, (props.to as FractionPoint | undefined) ?? LINE_TO]
  return []
}

// 線の点を、そのアイテムの項目にする（直線は from・to、自由な線は points）
export function linePropsOf(kind: string, points: readonly FractionPoint[]): Record<string, unknown> {
  return kind === FREE_LINE.id ? { points } : { from: points[0], to: points[1] }
}

// 線の点を動かしたときの項目: 点と、角度を外す（枠を紙の上の点から出し直すため）
export function movedLineProps(kind: string, points: readonly FractionPoint[]): Record<string, unknown> {
  return { ...linePropsOf(kind, points), rotation: null }
}

// 文字枠の文字の大きさ（px）の既定
export const DEFAULT_FONT_SIZE = 24

// 文字枠の行の高さ（文字の大きさに対する倍率）。文字枠の絵と書き換えの入力、置くときの大きさが同じ値を使う
export const TEXT_LINE_HEIGHT = 1.3
// 文字が空の文字枠の幅（px）: 1 文字より狭く、カーソルが 3 つ並ぶくらい。文字を打つと文字の幅に寄る
export const EMPTY_TEXT_WIDTH = 12
// 押しただけで置く文字枠の大きさ: 高さは文字 1 行分、幅は空の幅
const TEXT_FRAME_SIZE = { w: EMPTY_TEXT_WIDTH, h: Math.ceil(DEFAULT_FONT_SIZE * TEXT_LINE_HEIGHT) } as const

// アイテムの幅・高さの下限（px）
export const MIN_SIZE = 8
const MIN = { w: MIN_SIZE, h: MIN_SIZE } as const

export const TEXT_FRAME = kit.defineShape({
  id: "slide-text",
  kind: "shape",
  version: 1,
  title: "Text frame",
  capabilities: [],
  toolbox: true,
  props: TextFrameProps,
  tokens: [],
  size: TEXT_FRAME_SIZE,
  min: MIN,
  labelOf: item => (item.props as { text?: string }).text ?? "", // 文字枠の名前は、書いた文字
})

// 枠 r の中の割合の点 p の、紙の上の点
const inRect = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) => ({
  x: r.x + p.x * r.w,
  y: r.y + p.y * r.h,
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
  minimap: (item, r): MinimapMark[] => [{ kind: "polyline", points: item.props.points.map(p => inRect(p, r)) }],
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
  minimap: (item, r): MinimapMark[] => [
    { kind: "polyline", points: linePointsOf(STRAIGHT_LINE.id, item.props).map(p => inRect(p, r)) },
  ],
})

export const ELLIPSE = kit.defineShape({
  id: "slide-ellipse",
  kind: "shape",
  version: 1,
  title: "Ellipse",
  capabilities: [],
  toolbox: true,
  props: FigureProps,
  tokens: [],
  size: { w: 160, h: 100 },
  min: MIN,
  minimap: (_, r): MinimapMark[] => [{ kind: "ellipse", x: r.x, y: r.y, w: r.w, h: r.h }],
})

export const RECTANGLE = kit.defineShape({
  id: "slide-rectangle",
  kind: "shape",
  version: 1,
  title: "Rectangle",
  capabilities: [],
  toolbox: true,
  props: FigureProps,
  tokens: [],
  size: { w: 160, h: 100 },
  min: MIN,
  minimap: (_, r): MinimapMark[] => [{ kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h }],
})

export const SLIDE_ITEMS = [TEXT_FRAME, FREE_LINE, STRAIGHT_LINE, ELLIPSE, RECTANGLE] as const

// 線（自由な線・直線）。線は角度を数字で入れ、ほかは「水平に戻す」
export const isLineKind = (kind: string): boolean => kind === FREE_LINE.id || kind === STRAIGHT_LINE.id
// Ctrl（Mac は Command）で、置くときと角のつまみを引くときに縦横をそろえる種類（正円・正方形）
export const squarable = (kind: string): boolean => kind === ELLIPSE.id || kind === RECTANGLE.id
