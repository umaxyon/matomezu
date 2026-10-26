// リスト: キャプションの見出しの下に、行を上から順に並べる枠。行は箱と同じくキャプション・区切り線・本文を持ち、リストの中にだけある（紙に直には置けない）。
// データは枠が中身（children）を持つ形で、行の並びは children の順（内包と同じ形で、並べ方だけが違う）。
// リストは自分のテーマ（theme）と色（color）を持ち、行はリストに従う。チェックリスト（checklist）なら行の左にチェックの印を出し、行の checked で持つ
// （チェックリストをやめると、行の checked は消える）。チェックリストでは、チェック済みの行を薄く描く（checkedGray）、先頭か最後に寄せて見せる（checkedOrder）ことができる。
// 行の色分け（zebra）なら 1 行おきに地の色を少し変える。行がリストの高さを超えたら、リストの中でスクロールする。
// 描くテーマキーは、リストのテーマキー（list.*）だけ。塗り・文字・線・角・影は箱のテーマキーと同じ既定の値で（テーマは箱と同じ見た目にするなら両方を上書きする）、
// 見出しの帯・台紙・行の付箋のテーマキーは色を混ぜる割合などの値。台紙はリストの塗りから作り、行のカードはリストの塗り。色（color）を当てると台紙と見出しがその色になり、行のカードはテーマの地のまま（paint.ts）。
// テーマは大きさを変えないので、どのテーマでも行の高さと折り返しは同じ。
// 置くときは追加のダイアログ（list-add）、設定は編集のダイアログ（list-edit）。行は行の追加（row-add）・編集（row-edit）のダイアログで中身を決める
import { z } from "zod"
import { HEX, PALETTE, type ShapeAddArgs, type ShapeEditArgs } from "../../../plugin-api"
import { AlignSchema, textProps } from "../../base"
import { kit } from "./kit"
import { LIST_MIN, LIST_SIZE, listCaptionWidth, MAX_ROW_LINES, placedListWidth } from "./size"

// 行の項目（箱の項目と同じ並びに、チェックの印）
export const RowPropsSchema = z.strictObject({
  ...textProps("left"),
  checked: z.boolean().optional(), // チェックが入っているか（チェックリストのときだけ）
  lines: z.number().int().min(0).max(MAX_ROW_LINES).optional(), // 本文を見せる行数（無ければリストでそろえる。size.ts）
})
export type RowProps = z.infer<typeof RowPropsSchema>

// リストの行
export const ROW_ITEM = "list.row" as const
export const ListRowSchema = z.strictObject({ id: z.string().min(1), item: z.literal(ROW_ITEM), props: RowPropsSchema })
export type ListRow = z.infer<typeof ListRowSchema>

// リストの塗りのテーマキー（行のカードの地。色の見本の「なし」もこの色）
export const LIST_FILL = { id: "list-fill", fallback: "fill" } as const

// リストの追加のダイアログ。開いたステージのブックの、ページ page の at（紙の上の左上）に置く
export const LIST_ADD_DIALOG = kit.defineDialogWith<ShapeAddArgs>()({ id: "list-add" })
// リストの設定のダイアログ
export const LIST_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "list-edit" })

// チェックリストでないリストの行から、チェックの状態を消す（チェックリストをやめたとき）
export function settleChecks<L extends { props: { checklist: boolean }; children?: ListRow[] }>(list: L): L {
  const rows = list.children ?? []
  if (list.props.checklist || !rows.some(r => r.props.checked !== undefined)) return list
  const children = rows.map(r => {
    const { checked: _, ...props } = r.props
    return { ...r, props: props as RowProps }
  })
  return { ...list, children }
}

// 大きさは w・h（無ければキャプションの幅と、行 3 つぶんの空きの高さ）。中身は行（children の順）。
// 項目を変えたら、チェックリストでなくなったリストの行からチェックを消す
export const LIST = kit.defineShape({
  id: "shape-list",
  kind: "shape",
  version: 1,
  title: "List",
  capabilities: ["connectable", "resizable"],
  themeProp: "theme", // 個別のテーマ（この形だけ別のテーマで描く）
  captionProp: "caption", // キャプション（変わったら見える幅まで広げる）
  toolbox: true,
  content: { children: z.array(ListRowSchema) },
  min: LIST_MIN,
  sizeOf: list => ({ w: list.w ?? placedListWidth(list.props.caption), h: list.h ?? LIST_SIZE.h }),
  captionWidth: list => listCaptionWidth(list.props.caption),
  settle: settleChecks,
  dialogs: { add: LIST_ADD_DIALOG.id, edit: LIST_EDIT_DIALOG.id },
  props: z.strictObject({
    caption: z.string().default(""),
    captionAlign: AlignSchema.default("center"), // 見出しのキャプションの寄せ（箱と同じ）
    theme: z.string().min(1).optional(), // リストに当てるテーマの id（無ければブックのテーマ）
    color: z.union([z.enum(PALETTE), z.string().regex(HEX)]).optional(), // 塗りの色（箱と同じ）
    checklist: z.boolean().default(false), // 行の左にチェックの印を出す
    zebra: z.boolean().default(false), // 1 行おきに地の色を少し変える
    checkedGray: z.boolean().default(false), // チェックリストで、チェック済みの行を薄く描く
    checkedOrder: z.enum(["none", "first", "last"]).default("none"), // チェックリストで、チェック済みの行を先頭か最後に寄せて見せる（データの順は変えない）
  }),
  size: LIST_SIZE,
  tokens: [
    LIST_FILL,
    { id: "list-text", fallback: "text" }, // 文字（チェックの印も）
    { id: "list-line", value: "#cdcdd6" }, // 区切り線と行のカードの縁の線の色
    { id: "list-radius", value: "8px" }, // リストの角の丸み
    { id: "list-shadow", value: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.14))" }, // リストの影（CSS の filter の値）
    { id: "list-frame-line", value: "#cdcdd6" }, // リストの外枠の線
    { id: "list-mount-tint", value: "#000000" }, // 台紙（リストの地）に混ぜる色
    { id: "list-mount-mix", value: "5%" }, // 台紙に混ぜる割合（行のカードとの差）
    { id: "list-head-tint", value: "#000000" }, // 見出しの帯に混ぜる色
    { id: "list-head-mix", value: "0%" }, // 見出しの帯に混ぜる割合（0% なら帯なしで、台紙の上の文字）
    { id: "list-head-ink", value: "0%" }, // 見出しの文字を白に寄せる割合（濃い帯の上の白い文字）
    { id: "list-card-radius", value: "8px" }, // 行のカードの角の丸み
    { id: "list-card-shadow", value: "drop-shadow(0 1px 3px rgba(0, 0, 0, 0.14))" }, // 行のカードの影（CSS の filter の値）
    { id: "list-card-fold", value: "0px" }, // 行のカードの右上の折り返しの大きさ
    { id: "list-card-line", value: "0%" }, // 行のカードの縁の線の濃さ（線の色の割合。0% なら線なし）
  ],
})

// 行の追加のダイアログ（リスト list の最後に足す）
export const ROW_ADD_DIALOG = kit.defineDialogWith<{ page: string; list: string }>()({ id: "row-add" })
// 行の編集のダイアログ
export const ROW_EDIT_DIALOG = kit.defineDialogWith<{ page: string; list: string; row: string }>()({ id: "row-edit" })
