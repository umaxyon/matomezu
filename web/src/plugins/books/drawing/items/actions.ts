// 図面のページにアイテムを置く・動かすアクション
import { z } from "zod"
import { bookItems } from "../../../../core/book"
import { defineAction } from "../../../../core/def/action"
import { shapeSchema } from "../../../../core/placed"
import type { Registry } from "../../../../core/registry"
import { type Placed, shapeDefOf, shapesOf } from "../placed"
import { DIRS } from "./drag"
import {
  knownTheme,
  moveItems,
  nextItemId,
  placedSize,
  placeItem,
  removeItems,
  replacePushing,
  widenForCaption,
} from "./items"

const PointSchema = z.strictObject({ x: z.number(), y: z.number() })

// 置いた形のデータとして確かめる（形の定義の項目と中身の形。表に無い形は通らない）
function parsePlaced(reg: Registry, value: { item: string; [field: string]: unknown }): Placed | null {
  const def = shapeDefOf(reg, value.item)
  const parsed = def && shapeSchema(def).safeParse(value)
  return parsed?.success ? (parsed.data as Placed) : null
}

// 置くアイテムは、ブックで使えるアイテムだけ。項目は props（そのアイテムの項目の形で確かめる。書かなかった項目は既定。テーマは表にあるものだけ）。
// w・h は大きさを変えられるアイテムの幅と高さ（無ければ定義の幅と、箱は本文が 5 行まで見える高さ。データには決まった値を書く）
export const ITEM_PLACE = defineAction({
  id: "item.place",
  title: "Place item",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    at: PointSchema,
    w: z.number().optional(),
    h: z.number().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    if (!bookItems(ctx.registry, book).includes(args.item)) return null
    const props = ctx.registry.items.get(args.item)?.props.safeParse(args.props ?? {})
    if (!props?.success) return null
    const base = { id: nextItemId(book, ctx.newId), item: args.item, ...args.at, props: props.data }
    const resizable = ctx.registry.items.get(args.item)?.capabilities.includes("resizable")
    const draft = parsePlaced(ctx.registry, resizable && args.w !== undefined ? { ...base, w: args.w } : base)
    if (!draft) return null
    const size = placedSize(ctx.registry, draft)
    const item = resizable && size ? parsePlaced(ctx.registry, { ...draft, w: size.w, h: args.h ?? size.h }) : draft
    if (!item || !knownTheme(ctx.registry, item)) return null
    const next = placeItem(ctx.registry, book, args.page, item)
    return next && { next, result: { item: item.id } }
  },
})

// アイテムを by だけ動かす（items.ts の moveItems。1 つなら正面の相手と入れ替え・手前へ戻す、何個かならまとめて手前へ戻す）。収まらなければ断る
export const ITEM_MOVE = defineAction({
  id: "item.move",
  title: "Move items",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
    by: PointSchema,
    came: z.record(z.string(), z.enum(DIRS)).optional(), // ドラッグの通り道で覚えた、相手ごとの先端が来た向き（drag.ts）
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const next = moveItems(ctx.registry, book, args.page, args.items, args.by, args.came)
    return next && { next, result: {} }
  },
})

// アイテムの項目を変える。props に書いた項目だけを変え、書かなかった項目はそのまま。null を書いた項目は消す（既定に戻す）。
// 箱に当てるテーマ（theme）は表にあるものだけ。箱のキャプションが変わったら、20 字まで見える幅まで右へ広げ（items.ts の widenForCaption。狭めはしない）、
// 近づきすぎた相手を押す。押した相手が紙に収まらなければ、広げずに変える。項目の形に合わなければ断る
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
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && shapesOf(page).find(i => i.id === args.item)
    if (!now) return null
    const props = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const parsed = parsePlaced(ctx.registry, { ...now, props })
    if (!parsed || !page || !knownTheme(ctx.registry, parsed)) return null
    const item = (shapeDefOf(ctx.registry, parsed.item)?.settle?.(parsed) as Placed | undefined) ?? parsed
    const wide = widenForCaption(ctx.registry, page, now, item)
    const next =
      replacePushing(ctx.registry, book, args.page, wide, false) ??
      (wide !== item ? replacePushing(ctx.registry, book, args.page, item, false) : null)
    return next && { next, result: {} }
  },
})

// アイテムの大きさを変える（大きさを変えられるアイテムだけ）。渡した値だけを変える。x・y を渡せば左上も動かす（左や上の辺をつかんで変えるとき）。
// 近づきすぎた相手は、育った向きに押してどけ、押した列が紙からはみ出すなら、押された箱を縮めて収める（items.ts の replacePushing）。
// 一番小さい大きさより小さい・紙からはみ出す・縮めても収まらないなら断る
export const ITEM_RESIZE = defineAction({
  id: "item.resize",
  title: "Resize item",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    w: z.number().optional(),
    h: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && shapesOf(page).find(i => i.id === args.item)
    if (!now || !ctx.registry.items.get(now.item)?.capabilities.includes("resizable")) return null
    const size = placedSize(ctx.registry, now)
    if (!size) return null
    const item = parsePlaced(ctx.registry, {
      ...now,
      x: args.x ?? now.x,
      y: args.y ?? now.y,
      w: args.w ?? size.w,
      h: args.h ?? size.h,
    })
    if (!item) return null
    const next = replacePushing(ctx.registry, book, args.page, item, true)
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
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const next = removeItems(ctx.registry, book, args.page, args.items)
    return next && { next, result: {} }
  },
})
