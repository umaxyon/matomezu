// データ: 中に 2 次元の表（table.ts）を持ち、表かグラフで見せる形。表を持たない間は、点線の枠に「No Data」と出す。
// 見た目（view）は表・棒・折れ線・円・散布図から選び、既定は表。中身の表は中身のフィールド table に持ち、アクション data-set で丸ごと入れ替える。
// グラフの軸は、表の列を id で名指す（x・series・label）。表に無い列や型の合わない列を名指した軸は外し、グラフにしたときに軸が無ければ既定の列を選ぶ（axes.ts）。
// 箱と同じキャプションと本文（文字の領域）を、表やグラフの上か下に置ける（出さないこともできる。areas.ts）。
// 置くときはダイアログを開かずに、表の無いまま置く。表は編集のダイアログ（data-edit）で書き換える
import { z } from "zod"
import type { ShapeEditArgs } from "../../../plugin-api"
import { textProps } from "../../base"
import { captionWidthOf } from "./areas"
import { settleAxes } from "./axes"
import { kit } from "./kit"
import { TableSchema } from "./table"

// 見た目: 表（table）・棒（bar）・折れ線（line）・円（pie）・散布図（scatter）
export const DATA_VIEWS = ["table", "bar", "line", "pie", "scatter"] as const
export type DataViewKind = (typeof DATA_VIEWS)[number]

// 棒と折れ線を重ねるときの、系列ごとの描き方
export const SERIES_CHARTS = ["bar", "line"] as const
// 系列: 値の列 1 つ。棒・折れ線の系列はどれも同じ縦軸 1 本に描く
export const SeriesSchema = z.strictObject({
  column: z.string().min(1), // 値の列（数の列）の id
  chart: z.enum(SERIES_CHARTS).optional(), // 描き方（無ければ見た目に従う）
})
export type Series = z.infer<typeof SeriesSchema>
// 系列の数の上限（グラフの系列の色の数）
export const MAX_SERIES = 8

export const BAR_DIRECTIONS = ["vertical", "horizontal"] as const
// 項目の文字が入りきらないとき: 間を飛ばす（skip）か、45 度に傾けて、まだ入らなければ間を飛ばす（rotate）
export const CROWDS = ["skip", "rotate"] as const
// 間を飛ばすときに出す文字: 等間隔（even）・値の多い順（top）・選んだ行だけ（picked）
export const SKIPS = ["even", "top", "picked"] as const
export const SORTS = ["none", "desc", "asc"] as const

// 文字の領域（キャプションと本文）の置き場所: グラフや表の上（top）・下（bottom）・出さない（none）
export const TEXT_ATS = ["top", "bottom", "none"] as const

export const DataPropsSchema = z.strictObject({
  ...textProps("center"), // キャプション・区切り線・本文と寄せ（キャプションは中央寄せ）
  textAt: z
    .enum(TEXT_ATS)
    .default("top")
    .describe(
      "Where the caption and body sit: above the table or chart (top), below it (bottom), or not shown (none, keeping them in the data)",
    ),
  bodyWidth: z
    .number()
    .positive()
    .optional()
    .describe(
      "Width in pixels of the column the body wraps in, as in a box: never narrower than the caption; without it, the body fills the item's inside",
    ),
  theme: z.string().min(1).optional(), // データに当てるテーマの id（無ければブックのテーマ）
  view: z
    .enum(DATA_VIEWS)
    .default("table")
    .describe(
      "How the table is shown: table, bar, line, pie or scatter. Choosing a chart picks default axes when none are chosen: x the first column and series the first other number column (scatter: the first two number columns)",
    ),
  x: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Id of the column along the category axis (bar, line), of the slice labels (pie) or of the X values (scatter, a number column)",
    ),
  series: z
    .array(SeriesSchema)
    .max(MAX_SERIES)
    .default([])
    .describe(
      "The value columns (number columns, each once), drawn on one value axis. pie uses the first as the slice sizes and scatter the first as the Y values. chart (bar or line) draws one series differently from the view, to combine bars and lines in a vertical bar or line chart; use it only for values of the same unit",
    ),
  label: z.string().min(1).optional().describe("Id of the column naming each point of a scatter chart"),
  bar: z.enum(BAR_DIRECTIONS).default("vertical").describe("Bars grow up (vertical) or to the right (horizontal)"),
  sort: z
    .enum(SORTS)
    .default("none")
    .describe(
      "Order of the bars or pie slices: the table's order (none), the largest first (desc) or the smallest first (asc). The table's rows keep their order",
    ),
  sortBy: z
    .string()
    .min(1)
    .optional()
    .describe("Id of the series column that sort orders by (without it, the first series)"),
  crowd: z
    .enum(CROWDS)
    .default("skip")
    .describe(
      "When the category labels of a bar or line chart do not fit side by side: skip some (skip), or tilt them 45 degrees and skip some only when they still do not fit (rotate; vertical charts only). A label still too long for its room ends with an ellipsis",
    ),
  skip: z
    .enum(SKIPS)
    .default("even")
    .describe(
      "Which category labels show when some are skipped: evenly spaced, always the first and the last (even); the largest values first, by sortBy or the first series (top); or only the rows in picked (picked)",
    ),
  picked: z
    .array(z.string().min(1))
    .optional()
    .describe("Ids of the rows whose category label shows when skip is picked"),
  labelSize: z
    .number()
    .positive()
    .optional()
    .describe(
      "Size in pixels of the category label area: its height under a vertical chart, its width beside horizontal bars. Without it, the area fits one line (tilted labels: up to 40% of the height) or, beside horizontal bars, the widest label up to 35% of the width",
    ),
})
export type DataProps = z.infer<typeof DataPropsSchema>

// 編集のダイアログ。開いたステージのブックの、ページ page のデータ item の表を書き換える
export const DATA_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "data-edit" })

// 置いたときの大きさと、一番小さい大きさ
export const DATA_SIZE = { w: 160, h: 96 } as const
export const DATA_MIN = { w: 120, h: 80 } as const

// 系列の色の既定（明るい地と暗い地で別の値）
const SERIES_COLORS = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
  { light: "#e87ba4", dark: "#d55181" },
  { light: "#008300", dark: "#008300" },
  { light: "#6250d6", dark: "#9085e9" },
  { light: "#e34948", dark: "#e66767" },
] as const

// データのテーマキー（プラグインが持ち、アイテムは自分のテーマキーを持たない）
export const DATA_TOKENS = [
  { id: kit.name("data-fill"), fallback: "fill" }, // 地
  { id: kit.name("data-line"), value: "#cdcdd6" }, // 枠線と表の罫線
  { id: kit.name("data-text"), fallback: "text" }, // 文字
  { id: kit.name("data-radius"), value: "8px" }, // 角の丸み
  { id: kit.name("data-empty"), value: "#a0a0ab" }, // 表の無い間の点線の枠と「No Data」の文字
  // グラフの系列の色（決まった順に使う。色覚の違いでも隣どうしが見分けられる並び）
  ...SERIES_COLORS.map((value, i) => ({ id: kit.name(`data-series-${i + 1}`), value })),
  { id: kit.name("data-axis"), fallback: "hint" }, // 軸と凡例の文字
  { id: kit.name("data-grid"), value: { light: "#e6e6e1", dark: "#3a3a37" } }, // 目盛りの線
  { id: kit.name("data-zero"), fallback: "hint" }, // 値 0 の線
  { id: kit.name("data-head-fill"), value: "transparent" }, // 表の見出しの行の地
  { id: kit.name("data-shadow"), value: "none" }, // 影（CSS の filter の値）
  { id: kit.name("data-bar-radius"), value: "4px" }, // 棒の先の角の丸み（根元は丸めない）
  { id: kit.name("data-line-width"), value: "2px" }, // 折れ線の太さ
  { id: kit.name("data-dot-size"), value: "4px" }, // 点の半径
  // 動き（motion.ts）: きっかけごとの長さ（0ms なら動かさない）と緩急、印ごとの動き方
  { id: kit.name("data-motion-draw"), value: "600ms" }, // 初めて描いたとき
  { id: kit.name("data-motion-data"), value: "600ms" }, // 表を入れ替えたとき
  { id: kit.name("data-motion-look"), value: "600ms" }, // 見た目や軸を変えたとき
  { id: kit.name("data-motion-ease"), value: "cubic-bezier(0.2, 0, 0, 1)" },
  { id: kit.name("data-motion-bar"), value: "grow" }, // grow・fade・none
  { id: kit.name("data-motion-line"), value: "draw" }, // draw・fade・none
  { id: kit.name("data-motion-dot"), value: "pop" }, // pop・fade・none
  { id: kit.name("data-motion-pie"), value: "sweep" }, // sweep・pop・fade・none
] as const

export const DATA = kit.defineShape({
  id: "shape-data",
  kind: "shape",
  version: 1,
  title: "Data",
  capabilities: ["connectable", "resizable"],
  themeProp: "theme", // 個別のテーマ（この形だけ別のテーマで描く）
  captionProp: "caption", // キャプション（変わったら見える幅まで広げる）
  captionWidth: data => captionWidthOf(data.props.caption),
  toolbox: true,
  props: DataPropsSchema,
  content: { table: TableSchema },
  size: DATA_SIZE,
  min: DATA_MIN,
  dialogs: { edit: DATA_EDIT_DIALOG.id },
  "@matomezu/paper:settle": data => ({ ...data, props: settleAxes(data.props, data.table) }),
  tokens: [],
})
