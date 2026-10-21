// 図面のページにアイテムを置く・動かすアクション
import { z } from "zod"
import { defineAction } from "../../../../core/def/action"
import { bookType } from "../../../../core/registry"
import { itemsOf, moveItems, nextItemId, placeItem, removeItems, replaceItem } from "./items"
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
    const item = PlacedSchema.safeParse({
      id: nextItemId(book, ctx.newId),
      item: args.item,
      ...args.at,
      props: props.data,
    })
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

// アイテムの項目を変える。props に書いた項目だけを変え、書かなかった項目はそのまま。項目の形に合わなければ断る
export const ITEM_UPDATE = defineAction({
  id: "item.update",
  title: "Update item",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
  }),
  run: (book, args) => {
    if (book.type !== "drawing") return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && itemsOf(page).find(i => i.id === args.item)
    if (!now) return null
    const item = PlacedSchema.safeParse({ ...now, props: { ...now.props, ...args.props } })
    if (!item.success) return null
    const next = replaceItem(book, args.page, item.data)
    return next && { next, result: {} }
  },
})

// アイテムを消す。無いアイテムを含むなら断る
export const ITEM_REMOVE = defineAction({
  id: "item.remove",
  title: "Remove items",
  target: "book",
  needs: [],
  args: z.strictObject({ page: z.string().min(1), items: z.array(z.string().min(1)).min(1) }),
  run: (book, args) => {
    if (book.type !== "drawing") return null
    const next = removeItems(book, args.page, args.items)
    return next && { next, result: {} }
  },
})
