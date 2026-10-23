// 線: 同じページの 2 つの形（箱・リスト。リストの行にはつながない）を結ぶ。from から to へ引き、同じ形なら自分に戻る線。
// 通り方は直線か折れ線（route。無ければページの既定）、端の形（startHead・endHead）、破線（dash）、キャプション（caption）を持つ。
// 端は自由か、形のふちの上に固定（exitAt・enterAt。ふちを左上から時計回りに一周した割合）。手で直した折れ線の途中の区間（via）は、両端が固定のときだけ持つ。
// 道筋は持たず、つないだ形の位置から描くたびに決める（route.ts）
import { z } from "zod"
import { defineItem } from "../../../../core/def/item"
import { defineDialogWith } from "../../../../store/dialogs"
import { CAPTION_OFFSET_MAX } from "./caption"
import { HEADS } from "./heads"

export const ROUTES = ["straight", "elbow"] as const
export type LineRoute = (typeof ROUTES)[number]
export const DASHES = ["solid", "dashed"] as const

// ふち一周の割合・線の長さに対する割合
const Frac = z.number().min(0).max(1)

// 線の項目（どれも書かなくてよい）
const lineFields = () => ({
  route: z.enum(ROUTES), // 直線か折れ線（無ければページの既定）
  dash: z.enum(DASHES), // 実線か破線（無ければ実線）
  startHead: z.enum(HEADS), // 始点の端の形（無ければ何も付けない）
  endHead: z.enum(HEADS), // 終点の端の形
  exitAt: Frac, // 始点の固定の位置（無ければ自由）
  enterAt: Frac, // 終点の固定の位置
  via: z.array(z.number()).min(1), // 手で直した途中の区間の位置（両端が固定で、引けるときだけ）
  caption: z.string(), // キャプション（空白だけなら無いのと同じ）
  captionAt: Frac, // キャプションの、線の長さに対する位置（無ければ真ん中）
  captionOffset: z.number().min(-CAPTION_OFFSET_MAX).max(CAPTION_OFFSET_MAX), // キャプションを線から離す px（進む向きの左が正）
})
type LineFields = ReturnType<typeof lineFields>

const optional = <T extends Record<string, z.ZodType>>(f: T) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.optional()])) as { [K in keyof T]: z.ZodOptional<T[K]> }

// 変えるときに渡す形: 書いた項目だけを変え、null は消す（既定に戻す）
export const LinePatchSchema = z.strictObject(
  Object.fromEntries(Object.entries(lineFields()).map(([k, v]) => [k, v.nullable().optional()])) as {
    [K in keyof LineFields]: z.ZodOptional<z.ZodNullable<LineFields[K]>>
  },
)

export const LINE = defineItem({
  id: "connector.line",
  kind: "connector",
  version: 1,
  title: "Line",
  capabilities: [],
  toolbox: false,
  props: z.strictObject(optional(lineFields())),
  tokens: [
    { id: "line.color", fallback: "line" }, // 線と端の形の色
    { id: "line.text", fallback: "text" }, // キャプションの文字の色
  ],
})

// 線の編集のダイアログ。開いたステージのブックの、ページ page の線 item の項目を変える
export const LINE_EDIT_DIALOG = defineDialogWith<{ page: string; item: string }>()({ id: "line.edit" })
