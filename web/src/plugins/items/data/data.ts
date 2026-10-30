// データ: 中に 2 次元の表（table.ts）を持ち、表かグラフで見せる形。表を持たない間は、点線の枠に「No Data」と出す。
// 見た目（view）は表・棒・折れ線・円・散布図から選び、既定は表。中身の表は中身のフィールド table に持ち、アクション data-set で丸ごと入れ替える。
// グラフの軸は、表の列を id で名指す（x・series・label）。表に無い列や型の合わない列を名指した軸は外し、グラフにしたときに軸が無ければ既定の列を選ぶ（axes.ts）。
// 置くときはダイアログを開かずに、表の無いまま置く。表は編集のダイアログ（data-edit）で書き換える
import { z } from "zod"
import type { ShapeEditArgs } from "../../../plugin-api"
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
export const SORTS = ["none", "desc", "asc"] as const

export const DataPropsSchema = z.strictObject({
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
] as const

export const DATA = kit.defineShape({
  id: "shape-data",
  kind: "shape",
  version: 1,
  title: "Data",
  capabilities: ["connectable", "resizable"],
  themeProp: "theme", // 個別のテーマ（この形だけ別のテーマで描く）
  toolbox: true,
  props: DataPropsSchema,
  content: { table: TableSchema },
  size: DATA_SIZE,
  min: DATA_MIN,
  dialogs: { edit: DATA_EDIT_DIALOG.id },
  "@matomezu/paper:settle": data => ({ ...data, props: settleAxes(data.props, data.table) }),
  tokens: [],
})
