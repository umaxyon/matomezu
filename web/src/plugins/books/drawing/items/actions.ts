// 図面のページにアイテムを置く・動かすアクション
import { z } from "zod"
import { defineAction } from "../../../../core/def/action"
import { bookType } from "../../../../core/registry"
import { moveItems, nextItemId, placeItem } from "./items"
import { PlacedSchema } from "./schema"

const PointSchema = z.strictObject({ x: z.number(), y: z.number() })

// 置くアイテムは、ブックで使えるアイテムだけ。項目は props（そのアイテムの項目の形で確かめる。書かなかった項目は既定）
export const ITEM_PLACE = defineAction({
  id: "item.place",
  title: "Place item",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    at: PointSchema,
    props: z.record(z.string(), z.unknown()).optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    if (!bookType(ctx.registry, book.type).items.defaults.includes(args.item)) return null
    const props = ctx.registry.items.get(args.item)?.props.safeParse(args.props ?? {})
    if (!props?.success) return null
    const item = PlacedSchema.safeParse({ id: nextItemId(book), item: args.item, ...args.at, props: props.data })
    if (!item.success) return null
    const next = placeItem(ctx.registry, book, args.page, item.data)
    return next && { next, result: { item: item.data.id } }
  },
})

export const ITEM_MOVE = defineAction({
  id: "item.move",
  title: "Move items",
  target: "book",
  needs: [],
  args: z.strictObject({ page: z.string().min(1), items: z.array(z.string().min(1)).min(1), by: PointSchema }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const next = moveItems(ctx.registry, book, args.page, args.items, args.by)
    return next && { next, result: {} }
  },
})
