// 紙のページにアイテムを置く・動かすアクション

import { z } from "zod"
import {
  bookItems,
  type CoreCatalog,
  hasPages,
  type PlacedShape,
  placedSize,
  shapeSchema,
  shapesOf,
} from "../../../plugin-api"
import { knownTheme, nextItemId, placeItem, removeItems, replacePushing, shapeDefOf, widenForCaption } from "../../base"
import { kit } from "../kit"
import { DIRS } from "./drag"
import { moveItems } from "./items"

const PointSchema = z.strictObject({ x: z.number(), y: z.number() })

// 置いた形のデータとして確かめる（形の定義の項目と中身の形。表に無い形は通らない）
function parsePlaced(catalog: CoreCatalog, value: { item: string; [field: string]: unknown }): PlacedShape | null {
  const def = shapeDefOf(catalog, value.item)
  const parsed = def && shapeSchema(def).safeParse(value)
  return parsed?.success ? (parsed.data as PlacedShape) : null
}

// 置くアイテムは、ブックで使えるアイテムだけ。項目は props（そのアイテムの項目の形で確かめる。書かなかった項目は既定。テーマは表にあるものだけ）。
// w・h は大きさを変えられるアイテムの幅と高さ（無ければ定義の幅と、箱は本文が 5 行まで見える高さ。データには決まった値を書く）
// 紙の上にアイテムを置くアクションは、紙の見せ方のタイプについて来る
const ON_PAPER = { presentations: [kit.name("paper")] }

export const ITEM_PLACE = kit.defineAction({
  id: "item-place",
  attach: ON_PAPER,
  aiDescription:
    "Place an item on a page with its top-left at at (in paper pixels). w and h set the size of an item that can be resized (a box, a list). A list (@matomezu/list:shape-list) starts empty, 240 wide at the least, and scrolls when its rows do not fit; add rows with @matomezu/list:row-add. Without w, a box is as wide as its caption up to 20 characters (64 at the least); without h, tall enough to show up to 5 lines of its body. A box's body wraps to the width and what does not fit in the height is cut with …. Boxes it would come within 8 pixels of are pushed right, or else down, or else shrunk as they are pushed. It is refused if it does not fit on the paper. Returns the new item's id. Two items joined by a line keep 32 pixels apart (40 when the line has a caption) instead of 8, here and in @matomezu/paper:item-move, @matomezu/paper:item-update and @matomezu/paper:item-resize. The items, their props and sizes, the themes and the colors are in actions.",
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
    if (!hasPages(book)) return null
    if (!bookItems(ctx.catalog, book).includes(args.item)) return null
    const props = ctx.catalog.items.get(args.item)?.props.safeParse(args.props ?? {})
    if (!props?.success) return null
    const base = { id: nextItemId(book, ctx.newId), item: args.item, ...args.at, props: props.data }
    const resizable = ctx.catalog.items.get(args.item)?.capabilities.includes("resizable")
    const draft = parsePlaced(ctx.catalog, resizable && args.w !== undefined ? { ...base, w: args.w } : base)
    if (!draft) return null
    const size = placedSize(ctx.catalog, draft)
    const item = resizable && size ? parsePlaced(ctx.catalog, { ...draft, w: size.w, h: args.h ?? size.h }) : draft
    if (!item || !knownTheme(ctx.catalog, item)) return null
    const next = placeItem(ctx.catalog, book, args.page, item)
    return next && { next, result: { item: item.id } }
  },
})

// アイテムを by だけ動かす（items.ts の moveItems。1 つなら正面の相手と入れ替え・手前へ戻す、何個かならまとめて手前へ戻す）。収まらなければ断る
export const ITEM_MOVE = kit.defineAction({
  id: "item-move",
  attach: ON_PAPER,
  aiDescription:
    "Move items of a page by (x, y) paper pixels. Other boxes are not pushed: moving one box at least half into the box ahead of it swaps them; coming within 8 pixels of a box otherwise stops it just before that box. It is refused if any would leave the paper.",
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
    if (!hasPages(book)) return null
    const next = moveItems(ctx.catalog, book, args.page, args.items, args.by, args.came)
    return next && { next, result: {} }
  },
})

// アイテムの項目を変える。props に書いた項目だけを変え、書かなかった項目はそのまま。null を書いた項目は消す（既定に戻す）。
// 箱に当てるテーマ（theme）は表にあるものだけ。箱のキャプションが変わったら、20 字まで見える幅まで右へ広げ（items.ts の widenForCaption。狭めはしない）、
// 近づきすぎた相手を押す。押した相手が紙に収まらなければ、広げずに変える。項目の形に合わなければ断る
export const ITEM_UPDATE = kit.defineAction({
  id: "item-update",
  attach: ON_PAPER,
  aiDescription:
    "Change some props of an item (a box or a list; a line is changed with @matomezu/line:line-update). Props not given stay; a prop given as null is removed (back to its default). The item's size does not change, except that a box whose caption grows widens to show it up to 20 characters, pushing the boxes it would come too close to (when they would leave the paper, it stays as wide).",
  title: "Update item",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
  }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && shapesOf(page).find(i => i.id === args.item)
    if (!now) return null
    const props = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const parsed = parsePlaced(ctx.catalog, { ...now, props })
    if (!parsed || !page || !knownTheme(ctx.catalog, parsed)) return null
    const item = (shapeDefOf(ctx.catalog, parsed.item)?.settle?.(parsed) as PlacedShape | undefined) ?? parsed
    const wide = widenForCaption(ctx.catalog, page, now, item)
    const next =
      replacePushing(ctx.catalog, book, args.page, wide, false) ??
      (wide !== item ? replacePushing(ctx.catalog, book, args.page, item, false) : null)
    return next && { next, result: {} }
  },
})

// アイテムの大きさを変える（大きさを変えられるアイテムだけ）。渡した値だけを変える。x・y を渡せば左上も動かす（左や上の辺をつかんで変えるとき）。
// 近づきすぎた相手は、育った向きに押してどけ、押した列が紙からはみ出すなら、押された箱を縮めて収める（items.ts の replacePushing）。
// 一番小さい大きさより小さい・紙からはみ出す・縮めても収まらないなら断る
export const ITEM_RESIZE = kit.defineAction({
  id: "item-resize",
  attach: ON_PAPER,
  aiDescription:
    "Change the size of an item that can be resized (a box): only w and h given change; x and y move its top-left too. Boxes it would come within 8 pixels of are pushed the way it grew; when they reach the paper's edge, the pushed boxes shrink (no narrower than their caption, no lower than one caption line). It is refused below the item's smallest size, off the paper, or when they cannot shrink enough.",
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
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && shapesOf(page).find(i => i.id === args.item)
    if (!now || !ctx.catalog.items.get(now.item)?.capabilities.includes("resizable")) return null
    const size = placedSize(ctx.catalog, now)
    if (!size) return null
    const item = parsePlaced(ctx.catalog, {
      ...now,
      x: args.x ?? now.x,
      y: args.y ?? now.y,
      w: args.w ?? size.w,
      h: args.h ?? size.h,
    })
    if (!item) return null
    const next = replacePushing(ctx.catalog, book, args.page, item, true)
    return next && { next, result: {} }
  },
})

// アイテムを消す。無いアイテムを含むなら断る
export const ITEM_REMOVE = kit.defineAction({
  id: "item-remove",
  attach: ON_PAPER,
  aiDescription:
    "Remove items (boxes, lists, lines) from a page. Removing a box or a list removes the lines joined to it.",
  title: "Remove items",
  target: "book",
  needs: [],
  args: z.strictObject({ page: z.string().min(1), items: z.array(z.string().min(1)).min(1) }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const next = removeItems(ctx.catalog, book, args.page, args.items)
    return next && { next, result: {} }
  },
})
