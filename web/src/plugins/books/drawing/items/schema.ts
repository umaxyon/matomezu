// 図面のページに置いたアイテムのデータの形。アイテムの種類（item）ごとに、そのアイテムの項目の形（props）を持つ。
// id はブックの中で重ならない短い id（nextItemId）。位置は紙の左上から。大きさは items.ts の placedSize（大きさを変えられるアイテムは w・h を持つ）。
// 中身を持つアイテム（リスト）は children に中身を持つ（リストの行。並びは children の順）
import { z } from "zod"
import { PageSchema } from "../../../../core/schema/page"
import { BOX } from "../box"
import { BOX_MIN } from "../box/size"
import { LIST, ListRowSchema } from "../list"
import { LIST_MIN } from "../list/size"

const at = { id: z.string().min(1), x: z.number(), y: z.number() }

export const PlacedSchema = z.discriminatedUnion("item", [
  z.strictObject({
    ...at,
    item: z.literal(BOX.id),
    w: z.number().min(BOX_MIN.w).optional(),
    h: z.number().min(BOX_MIN.h).optional(),
    props: BOX.props,
  }),
  z.strictObject({
    ...at,
    item: z.literal(LIST.id),
    w: z.number().min(LIST_MIN.w).optional(),
    h: z.number().min(LIST_MIN.h).optional(),
    props: LIST.props,
    children: z.array(ListRowSchema).optional(),
  }),
])
export type Placed = z.infer<typeof PlacedSchema>

// 図面のページ。items が無ければ、何も置いていない
export const DrawingPageSchema = PageSchema.extend({ items: z.array(PlacedSchema).optional() })
export type DrawingPage = z.infer<typeof DrawingPageSchema>
