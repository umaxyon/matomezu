// 図面に置けるアイテムの表と、図面のページのデータの形。置き方の層（items）は、アイテムの置き方をここから引く（items/placed-def.ts の約束）。
// アイテムを足すときは、そのアイテムの置き方を書いて、ここに並べる
import { z } from "zod"
import { PageSchema } from "../../../core/schema/page"
import { BOX_PLACED, PlacedBoxSchema } from "./box/placed"
import type { PlacedDef } from "./items/placed-def"
import { LIST_PLACED, PlacedListSchema } from "./list/placed"

// 置いたアイテムのデータ。アイテムの種類（item）ごとに、そのアイテムの形
export const PlacedSchema = z.discriminatedUnion("item", [PlacedBoxSchema, PlacedListSchema])
export type Placed = z.infer<typeof PlacedSchema>

// 図面のページ。items が無ければ、何も置いていない
export const DrawingPageSchema = PageSchema.extend({ items: z.array(PlacedSchema).optional() })
export type DrawingPage = z.infer<typeof DrawingPageSchema>

const PLACED: { [I in Placed as I["item"]]: PlacedDef<I> } = {
  [BOX_PLACED.id]: BOX_PLACED,
  [LIST_PLACED.id]: LIST_PLACED,
}

// アイテムの置き方（置いたアイテムの種類から）。表のアイテムごとの約束を、置いたアイテム全体の型で引く
export const placedDef = (item: Placed): PlacedDef<Placed> => PLACED[item.item] as PlacedDef<Placed>

// アイテムの id の置き方（置く前。図面に置けないアイテムなら undefined）
export const placedDefOf = (id: string): PlacedDef<Placed> | undefined =>
  (PLACED as Record<string, PlacedDef<Placed>>)[id]
