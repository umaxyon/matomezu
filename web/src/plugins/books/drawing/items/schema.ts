// 図面のページに置いたアイテムのデータの形。アイテムの種類（item）ごとに、そのアイテムの項目の形（props）を持つ。
// id はブックの中で重ならない「b と番号」。位置は紙の左上から、大きさはアイテムの定義の大きさ
import { z } from "zod"
import { PageSchema } from "../../../../core/schema/page"
import { BOX } from "../box"

const at = { id: z.string().min(1), x: z.number(), y: z.number() }

export const PlacedSchema = z.discriminatedUnion("item", [
  z.strictObject({ ...at, item: z.literal(BOX.id), props: BOX.props }),
])
export type Placed = z.infer<typeof PlacedSchema>

// 図面のページ。items が無ければ、何も置いていない
export const DrawingPageSchema = PageSchema.extend({ items: z.array(PlacedSchema).optional() })
export type DrawingPage = z.infer<typeof DrawingPageSchema>
