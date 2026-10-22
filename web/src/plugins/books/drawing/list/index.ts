// リスト: キャプションの見出しの下に、行を上から順に並べる枠。行は箱と同じくキャプション・区切り線・本文を持ち、リストの中にだけある（紙に直には置けない）。
// データは枠が中身（children）を持つ形で、行の並びは children の順（内包と同じ形で、並べ方だけが違う）。
// リストは自分のテーマ（theme）と色（color）を持ち、行はリストに従う。チェックリスト（checklist）なら行の左にチェックの印を出し、行の checked で持つ
// （チェックリストをやめると、行の checked は消える）。行の色分け（zebra）なら 1 行おきに地の色を少し変える。行がリストの高さを超えたら、リストの中でスクロールする。
// 描くテーマの欄は、色と線と角と影は箱の欄（box.*。同じプラグインの箱が宣言している）、リストだけの見せ方（見出しの帯・台紙・行の付箋）は list.* の欄。
// list.* の欄は色を混ぜる割合などの値で、色はリストの塗り（色を当てればその色）から作る。テーマは大きさを変えないので、どのテーマでも行の高さと折り返しは同じ。
// 置くときは追加のダイアログ（list.add）、設定は編集のダイアログ（list.edit）。行は行の追加（row.add）・編集（row.edit）のダイアログで中身を決める
import { z } from "zod"
import { HEX, PALETTE } from "../../../../core/color"
import { defineItem } from "../../../../core/def/item"
import type { Point } from "../../../../core/geom"
import { defineDialogWith } from "../../../../store/dialogs"
import { AlignSchema } from "../box"
import { BOX_BODY_MAX } from "../box/size"
import { LIST_SIZE, MAX_ROW_LINES } from "./size"

// 行の項目（箱の項目と同じ並びに、チェックの印）
export const RowPropsSchema = z.strictObject({
  caption: z.string().default(""),
  rule: z.boolean().default(true),
  body: z.string().max(BOX_BODY_MAX).default(""),
  captionAlign: AlignSchema.default("left"),
  bodyAlign: AlignSchema.default("left"),
  checked: z.boolean().optional(), // チェックが入っているか（チェックリストのときだけ）
  lines: z.number().int().min(0).max(MAX_ROW_LINES).optional(), // 本文を見せる行数（無ければリストでそろえる。size.ts）
})
export type RowProps = z.infer<typeof RowPropsSchema>

// リストの行
export const ROW_ITEM = "list.row" as const
export const ListRowSchema = z.strictObject({ id: z.string().min(1), item: z.literal(ROW_ITEM), props: RowPropsSchema })
export type ListRow = z.infer<typeof ListRowSchema>

export const LIST = defineItem({
  id: "shape.list",
  kind: "shape",
  version: 1,
  title: "List",
  capabilities: ["connectable", "resizable", "hasText"],
  toolbox: true,
  props: z.strictObject({
    caption: z.string().default(""),
    theme: z.string().min(1).optional(), // リストに当てるテーマの id（無ければブックのテーマ）
    color: z.union([z.enum(PALETTE), z.string().regex(HEX)]).optional(), // 塗りの色（箱と同じ）
    checklist: z.boolean().default(false), // 行の左にチェックの印を出す
    zebra: z.boolean().default(false), // 1 行おきに地の色を少し変える
  }),
  size: LIST_SIZE,
  tokens: [
    { id: "list.head-tint", value: "#6d4bd8" }, // 見出しの帯に混ぜる色
    { id: "list.head-mix", value: "12%" }, // 見出しの帯に混ぜる割合（0% なら帯なし）
    { id: "list.head-ink", value: "0%" }, // 見出しの文字を白に寄せる割合（濃い帯の上の白い文字）
    { id: "list.mount-tint", value: "#000000" }, // 台紙（リストの地。「＋」の下と、行の無い所）に混ぜる色
    { id: "list.mount-mix", value: "4%" }, // 台紙に混ぜる割合（0% なら行と同じ地。標準は行よりほんの少し暗く）
    { id: "list.card-inset", value: "0px" }, // 行の付箋を行の帯からどれだけ内側に描くか（0px なら帯いっぱい）
    { id: "list.card-radius", value: "0px" }, // 行の付箋の角の丸み
    { id: "list.card-shadow", value: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12))" }, // 行の付箋の影（CSS の filter の値。標準は軽い影で、行が台紙から浮く）
    { id: "list.card-fold", value: "0px" }, // 行の付箋の右上の折り返しの大きさ
    { id: "list.rule-mix", value: "45%" }, // 行の仕切り線の濃さ（線の色の割合。0% なら線なし）
  ],
})

// リストの追加のダイアログ。開いたステージのブックの、ページ page の at（紙の上の左上）に置く
export const LIST_ADD_DIALOG = defineDialogWith<{ page: string; at: Point }>()({ id: "list.add" })
// リストの設定のダイアログ
export const LIST_EDIT_DIALOG = defineDialogWith<{ page: string; item: string }>()({ id: "list.edit" })
// 行の追加のダイアログ（リスト list の最後に足す）
export const ROW_ADD_DIALOG = defineDialogWith<{ page: string; list: string }>()({ id: "row.add" })
// 行の編集のダイアログ
export const ROW_EDIT_DIALOG = defineDialogWith<{ page: string; list: string; row: string }>()({ id: "row.edit" })
