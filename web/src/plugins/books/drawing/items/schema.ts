// 図面のページに置いたアイテムのデータの形。アイテムの種類（item）ごとに、そのアイテムの項目の形（props）を持つ。
// id はブックの中で重ならない短い id（nextItemId）。位置は紙の左上から。大きさは items.ts の placedSize（幅を変えたアイテムは w を持つ）
import { z } from "zod"
import { PageSchema } from "../../../../core/schema/page"
import { BOX } from "../box"
import { BOX_MIN_W } from "../box/size"

const at = { id: z.string().min(1), x: z.number(), y: z.number() }

export const PlacedSchema = z.discriminatedUnion("item", [
  z.strictObject({ ...at, item: z.literal(BOX.id), w: z.number().min(BOX_MIN_W).optional(), props: BOX.props }),
])
export type Placed = z.infer<typeof PlacedSchema>

// 図面のページ。items が無ければ、何も置いていない
export const DrawingPageSchema = PageSchema.extend({ items: z.array(PlacedSchema).optional() })
export type DrawingPage = z.infer<typeof DrawingPageSchema>
