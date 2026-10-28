// 紙のページにアイテムを置く・動かすアクション

import { z } from "zod"
import {
  bookItems,
  type CoreCatalog,
  findShape,
  hasPages,
  type ItemPage,
  type PlacedShape,
  putPage,
  type ShapeData,
  shapeSchema,
} from "../../../plugin-api"
import {
  knownTheme,
  nextItemId,
  placeChild,
  placedSize,
  placeItem,
  removeItems,
  replaceChild,
  replacePushing,
  replaceShape,
  settleChildren,
  shapeDefOf,
  widenForCaption,
} from "../../base"
import { kit } from "../kit"
import { DIRS } from "./drag"
import { moveItems } from "./items"

// 項目を変えたあとに形が中身を整えるメソッド（定義オブジェクトの拡張ポイントに、紙のプラグインの id を頭に付けて書き足す）。
// before は変える前の形。無ければそのまま
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    "@matomezu/paper:settle"?(item: D, before?: D): D
  }
}

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

// 形 next を、ページの形なら置き換えて紙の中で押し（replacePushing。shrink なら押した列を縮める）、子の形なら置き換えて親の中で押す（縮めない。replaceChild）。
// どちらも、子の領域より左や上に来た子は、並びを崩さずに右や下へずらす（本文が伸びたときなど。settleChildren）
function replaceAnywhere<B extends Parameters<typeof replacePushing>[1]>(
  catalog: CoreCatalog,
  book: B,
  page: ItemPage,
  next: PlacedShape,
  shrink: boolean,
): B | null {
  const parent = findShape(page, next.id)?.parent
  if (parent === undefined) return null
  const settled = settleChildren(catalog, next)
  return parent === null
    ? replacePushing(catalog, book, page.id, settled, shrink)
    : replaceChild(catalog, book, page.id, settled)
}

export const ITEM_PLACE = kit.defineAction({
  id: "item-place",
  attach: ON_PAPER,
  aiDescription:
    "Place an item on a page with its top-left at at (in paper pixels). With parent (the id of a shape that can hold children, such as a nest box @matomezu/box:shape-nest-box), the item becomes the parent's last child and at is from the parent's top-left; it goes in the parent's child area below its caption and body (moved there if at is left of or above it), pushing the other children right or else down as on the paper, and the parent grows to hold its children and pushes the page's boxes as it grows. w and h set the size of an item that can be resized (a box, a list). A list (@matomezu/list:shape-list) starts empty, 240 wide at the least, and scrolls when its rows do not fit; add rows with @matomezu/list:row-add. Without w, a box is as wide as its caption up to 20 characters (64 at the least); without h, tall enough to show up to 5 lines of its body. A box's body wraps to the width and what does not fit in the height is cut with …. Boxes it would come within 8 pixels of are pushed right, or else down, or else shrunk as they are pushed. It is refused if it does not fit on the paper. Returns the new item's id. Two items joined by a line keep 32 pixels apart (40 when the line has a caption) instead of 8, here and in @matomezu/paper:item-move, @matomezu/paper:item-update and @matomezu/paper:item-resize. The items, their props and sizes, the themes and the colors are in actions.",
  title: "Place item",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    at: PointSchema,
    parent: z.string().min(1).optional(), // 子にする親の形の id（親の左上から at に置く）
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
    const next =
      args.parent === undefined
        ? placeItem(ctx.catalog, book, args.page, item)
        : placeChild(ctx.catalog, book, args.page, args.parent, item, args.at)
    return next && { next, result: { item: item.id } }
  },
})

// アイテムを by だけ動かす（items.ts の moveItems。1 つなら正面の相手と入れ替え・手前へ戻す、何個かならまとめて手前へ戻す）。収まらなければ断る
export const ITEM_MOVE = kit.defineAction({
  id: "item-move",
  attach: ON_PAPER,
  aiDescription:
    "Move items of a page by (x, y) paper pixels. Other boxes are not pushed: moving one box at least half into the box ahead of it swaps them; coming within 8 pixels of a box otherwise stops it just before that box. It is refused if any would leave the paper. Children (shapes inside a parent) move the same way inside their parent's child area (below its caption and body; it has no right or bottom edge, the parent grows to hold them and pushes the page's boxes). Items of the page and children, or children of different parents, are not moved together.",
  title: "Move items",
  target: "book",
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

// 形を、子を持てる形の中へ移す・ページへ出す（付け替え）。紙の上の位置は変えず、子孫と、つながる線も一緒に移る。
// 中では、子の領域より左や上なら子の領域の左上へ寄せ、兄弟を押す（placeChild）。親は子が入る大きさに育ち、ページの形を押す。
// 自分か自分の子孫の中へ・子を持てない形の中へ・今と同じ親へは断る。紙に収まらなければ断る
export const ITEM_REPARENT = kit.defineAction({
  id: "item-reparent",
  attach: ON_PAPER,
  aiDescription:
    "Move a shape into a shape that can hold children (parent: its id) or out to the page (parent: null), keeping where it is on the paper; its children and the lines joined to them come along. Inside, it goes in the parent's child area (moved there if it is left of or above it), pushing the other children as in @matomezu/paper:item-place. The parent grows to hold it and pushes the page's boxes; on the page, boxes it comes within 8 pixels of are pushed as in @matomezu/paper:item-place. It is refused into itself or its children, into a shape that cannot hold children, into the parent it is already in, or when it does not fit on the paper.",
  title: "Reparent item",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    parent: z.string().min(1).nullable(), // 入れる先の形の id（null はページ）
  }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const found = page && findShape(page, args.item)
    if (!page || !found || found.parent === args.parent) return null
    // 抜いたページ（線の整えはまだかけない。抜いた形につながる線を残すため）
    const out = replaceShape(page, args.item, () => null)
    const without = out && putPage(book, out)
    if (!out || !without) return null
    const shape = found.shape
    if (args.parent === null) {
      const next = placeItem(ctx.catalog, without, args.page, { ...shape, ...found.at })
      return next && { next, result: {} }
    }
    // 入れる先は抜いたあとのページで探す（自分か自分の子孫の中へは、見つからないので断る）
    const into = findShape(out, args.parent)
    if (!into) return null
    const at = { x: found.at.x - into.at.x, y: found.at.y - into.at.y }
    const next = placeChild(ctx.catalog, without, args.page, args.parent, shape, at)
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
    "Change some props of an item (a box or a list, also a child inside a parent; a line is changed with @matomezu/line:line-update). Props not given stay; a prop given as null is removed (back to its default). The item's size does not change, except that a box whose caption grows widens to show it up to 20 characters, pushing the boxes it would come too close to (when they would leave the paper, it stays as wide). When a box's caption or body grows so its children's area moves down, its children move down with it, keeping how they lie.",
  title: "Update item",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
  }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && findShape(page, args.item)?.shape
    if (!now) return null
    const props = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const parsed = parsePlaced(ctx.catalog, { ...now, props })
    if (!parsed || !page || !knownTheme(ctx.catalog, parsed)) return null
    const item =
      (shapeDefOf(ctx.catalog, parsed.item)?.[kit.name("settle")]?.(parsed, now) as PlacedShape | undefined) ?? parsed
    const wide = widenForCaption(ctx.catalog, book, page, now, item)
    const next =
      replaceAnywhere(ctx.catalog, book, page, wide, false) ??
      (wide !== item ? replaceAnywhere(ctx.catalog, book, page, item, false) : null)
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
    "Change the size of an item that can be resized (a box): only w and h given change; x and y move its top-left too. A child stays in its parent's child area (x and y are from the parent's top-left) and pushes the other children, which do not shrink; its parent grows to hold it and pushes the page's boxes. Boxes it would come within 8 pixels of are pushed the way it grew; when they reach the paper's edge, the pushed boxes shrink (no narrower than their caption, no lower than one caption line). It is refused below the item's smallest size, off the paper, or when they cannot shrink enough.",
  title: "Resize item",
  target: "book",
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
    const now = page && findShape(page, args.item)?.shape
    if (!page || !now || !ctx.catalog.items.get(now.item)?.capabilities.includes("resizable")) return null
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
    const next = replaceAnywhere(ctx.catalog, book, page, item, true)
    return next && { next, result: {} }
  },
})

// アイテムを消す（どの深さの子の形も。形は子孫ごと消える）。無いアイテムを含むなら断る
export const ITEM_REMOVE = kit.defineAction({
  id: "item-remove",
  attach: ON_PAPER,
  aiDescription:
    "Remove items (boxes, lists, lines, and children inside a parent) from a page. Removing a box or a list removes its children and the lines joined to any of them.",
  title: "Remove items",
  target: "book",
  args: z.strictObject({ page: z.string().min(1), items: z.array(z.string().min(1)).min(1) }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const next = removeItems(ctx.catalog, book, args.page, args.items)
    return next && { next, result: {} }
  },
})
