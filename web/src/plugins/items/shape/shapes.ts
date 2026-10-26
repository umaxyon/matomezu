// 形のアイテム: キャプションを 1 行持つ、輪郭の違う 8 つの形（角丸・ひし形・平行四辺形とその逆・台形とその逆・六角形・円）。
// 向きが逆の形は、反転の項目ではなく別のアイテムにする。本文は持たない。大きさの決まりは箱と同じ（w・h を利用者が変える）。
// 項目は箱と同じく、キャプションと寄せ・色（代表色の名前か #rrggbb）・個別のテーマ。テーマキーは 8 つの形で共通の 1 組。
// 置くときは形ごとの追加のダイアログでキャプションと色を聞いてから置き、中身は 1 つの編集のダイアログで変える
import { z } from "zod"
import { HEX, PALETTE, type ShapeAddArgs, type ShapeEditArgs } from "../../../plugin-api"
import { AlignSchema } from "../../base"
import { kit } from "./kit"
import type { SHAPE_MESSAGES } from "./messages"
import type { ShapeKind } from "./outline"
import { SHAPE_RULES } from "./outline"
import { placedWidth, SHAPE_MIN } from "./size"

export const SHAPE_FILL = { id: kit.name("shape-fill"), fallback: "fill" } as const
// 8 つの形で共通のテーマキー（プラグインが持つ。形のアイテムは自分のテーマキーを持たない）
export const SHAPE_TOKENS = [
  SHAPE_FILL,
  { id: kit.name("shape-line"), value: "#cdcdd6" }, // 輪郭の線
  { id: kit.name("shape-text"), fallback: "text" },
  { id: kit.name("shape-shadow"), value: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.14))" }, // 影（CSS の filter の値）
] as const

export const ShapePropsSchema = z.strictObject({
  caption: z.string().default(""),
  captionAlign: AlignSchema.default("center"),
  theme: z.string().min(1).optional(), // 形に当てるテーマの id（無ければブックのテーマ）
  color: z.union([z.enum(PALETTE), z.string().regex(HEX)]).optional(), // 塗りの色（代表色の名前か #rrggbb。無ければテーマの塗り）
})

// 編集のダイアログ（どの形も同じ）
export const SHAPE_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "shape-edit" })

// 形 1 つの定義と、その追加のダイアログ（置く形はダイアログで決まっているので、形ごとに 1 つ）
function shape<const Id extends string, const Title extends keyof typeof SHAPE_MESSAGES & string>(
  name: Id,
  kind: ShapeKind,
  title: Title,
) {
  const add = kit.defineDialogWith<ShapeAddArgs>()({ id: `${name}-add` })
  const item = kit.defineShape({
    id: `shape-${name}`,
    kind: "shape",
    version: 1,
    title,
    capabilities: ["connectable", "resizable"],
    themeProp: "theme",
    captionProp: "caption",
    toolbox: true,
    props: ShapePropsSchema,
    size: SHAPE_RULES[kind].size,
    min: SHAPE_MIN,
    sizeOf: s => ({ w: s.w ?? placedWidth(kind, s.props.caption), h: s.h ?? SHAPE_RULES[kind].size.h }),
    captionWidth: s => placedWidth(kind, s.props.caption),
    dialogs: { add: add.id, edit: SHAPE_EDIT_DIALOG.id },
    tokens: [],
  })
  return { item, add, kind }
}

export const ROUNDED = shape("rounded", "rounded", "Rounded")
export const DIAMOND = shape("diamond", "diamond", "Diamond")
export const PARALLELOGRAM = shape("parallelogram", "parallelogram", "Parallelogram")
export const PARALLELOGRAM_REVERSED = shape(
  "parallelogram-reversed",
  "parallelogram-reversed",
  "Parallelogram (reversed)",
)
export const TRAPEZOID = shape("trapezoid", "trapezoid", "Trapezoid")
export const TRAPEZOID_REVERSED = shape("trapezoid-reversed", "trapezoid-reversed", "Trapezoid (reversed)")
export const HEXAGON = shape("hexagon", "hexagon", "Hexagon")
export const CIRCLE = shape("circle", "circle", "Circle")

export const SHAPES = [
  ROUNDED,
  DIAMOND,
  PARALLELOGRAM,
  PARALLELOGRAM_REVERSED,
  TRAPEZOID,
  TRAPEZOID_REVERSED,
  HEXAGON,
  CIRCLE,
] as const
