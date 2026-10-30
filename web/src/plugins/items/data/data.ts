// データ: 中に 2 次元の表（table.ts）を持ち、表かグラフで見せる形。表を持たない間は、点線の枠に「No Data」と出す。
// 見た目（view）は表・棒・折れ線・円・散布図から選び、既定は表。中身の表は中身のフィールド table に持ち、アクション data-set で丸ごと入れ替える。
// 置くときはダイアログを開かずに、表の無いまま置く。表は編集のダイアログ（data-edit）で書き換える
import { z } from "zod"
import type { ShapeEditArgs } from "../../../plugin-api"
import { kit } from "./kit"
import { TableSchema } from "./table"

// 見た目: 表（table）・棒（bar）・折れ線（line）・円（pie）・散布図（scatter）
export const DATA_VIEWS = ["table", "bar", "line", "pie", "scatter"] as const
export type DataViewKind = (typeof DATA_VIEWS)[number]

export const DataPropsSchema = z.strictObject({
  theme: z.string().min(1).optional(), // データに当てるテーマの id（無ければブックのテーマ）
  view: z.enum(DATA_VIEWS).default("table"),
})

// 編集のダイアログ。開いたステージのブックの、ページ page のデータ item の表を書き換える
export const DATA_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "data-edit" })

// 置いたときの大きさと、一番小さい大きさ
export const DATA_SIZE = { w: 160, h: 96 } as const
export const DATA_MIN = { w: 120, h: 80 } as const

// データのテーマキー（プラグインが持ち、アイテムは自分のテーマキーを持たない）
export const DATA_TOKENS = [
  { id: kit.name("data-fill"), fallback: "fill" }, // 地
  { id: kit.name("data-line"), value: "#cdcdd6" }, // 枠線と表の罫線
  { id: kit.name("data-text"), fallback: "text" }, // 文字
  { id: kit.name("data-radius"), value: "8px" }, // 角の丸み
  { id: kit.name("data-empty"), value: "#a0a0ab" }, // 表の無い間の点線の枠と「No Data」の文字
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
  tokens: [],
})
