// 紙のページにアイテムを置く・動かすアクション

import { z } from "zod"
import {
  allowedItems,
  type CoreCatalog,
  findPage,
  findShape,
  type ItemPage,
  type PlacedShape,
  type Point,
  putPage,
  replaceShape,
  type ShapeData,
} from "../../../plugin-api"
import {
  allRectsOf,
  nextItemIdOfBook,
  placeChild,
  placedSize,
  placeItem,
  removeItems,
  replaceChild,
  replacePushing,
  settleChildren,
  shapeDefOf,
  shapeThemeFits,
  widenForCaption,
} from "../../base"
import { kit } from "../kit"
import { pasted } from "./clip"
import { ancestorsOf, CROWD_AI, CrowdSchema, crowded, movedShapes, NO_FREE_SPOT, PointSchema } from "./crowd"
import { DIRS } from "./drag"
import { freeAt, moveItems, parsePlaced, subtreeOf } from "./items"

// 項目を変えたあとに形が中身を整えるメソッド（定義オブジェクトの拡張ポイントに、紙のプラグインの id を頭に付けて書き足す）。
// before は変える前の形。無ければそのまま
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    "@matomezu/paper:settle"?(item: D, before?: D): D
    // 大きさを変えられる向き: "width" なら幅だけ（高さは中身から決まる形。つかめるのは左右の辺だけで、高さは置いた大きさのまま）。
    // "ratio" なら幅と高さの比を保つ（つかめるのは角だけ。高さは幅から決まる）。無ければ幅も高さも
    "@matomezu/paper:stretch"?: "width" | "ratio"
    // false なら、コピーして貼る（id を振り直す）と壊れる形で、写さない（中の id を指す項目を持つ形など）。書かなければ写せる
    "@matomezu/paper:copies"?: false
  }
}

// 置くアイテムは、ブックで使えるアイテムだけ。項目は props（そのアイテムの項目の形で確かめる。書かなかった項目は既定。テーマはページのタイプが使えるものだけ。base の book-look/theme-types.ts）。
// w・h は大きさを変えられるアイテムの幅と高さ（無ければ、そのアイテムの定義が決める大きさ。データには決まった値を書く）
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
    "Place an item on a page with its top-left at at (in paper pixels). With parent (the id of a shape that can hold children), the item becomes the parent's last child and at is from the parent's top-left; it goes in the parent's child area below its caption and body (moved there if at is left of or above it), and the parent grows to hold its children. Without at, it goes in the first free spot of the parent (or of the page): a grid from the top-left, left to right, then down. w and h set the size of an item that can be resized; without them it takes its own default size (see its props). Coming within 8 pixels of another shape (shapes joined by some connectors keep further apart; see those connectors' actions) would move it: " +
    CROWD_AI +
    " Pushed shapes go right, or else down, or else shrink as they are pushed; a parent that grows pushes the page's shapes the same way. It is refused if it does not fit on the paper (on a variable page, the papers it has plus a blank one each way it grows; see page-add). Returns the new item's id and its at. To see where shapes are drawn (their size as drawn), read_page. The items, their props and sizes, the themes and the colors are in actions; a theme must be one its book type lists (pageTypes[].themes in actions).",
  title: "Place item",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    at: PointSchema.optional(), // 左上（無ければ親かページの中の空き。base の freeSpotIn）
    parent: z.string().min(1).optional(), // 子にする親の形の id（親の左上から at に置く）
    crowd: CrowdSchema,
    w: z.number().optional(),
    h: z.number().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
  }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    const page = findPage(book, args.page)?.page
    if (!page || !allowedItems(ctx.catalog, page).includes(args.item)) return null
    const props = ctx.catalog.items.get(args.item)?.props.safeParse(args.props ?? {})
    if (!props?.success) return null
    const base = { id: nextItemIdOfBook(book, ctx.newId), item: args.item, x: 0, y: 0, props: props.data }
    // 大きさを w・h に持つ形か（大きさを項目に写す形〈定義の resizedTo〉は、w・h を書かない。大きさは項目から決まる）
    const resizable =
      ctx.catalog.items.get(args.item)?.capabilities.includes("resizable") &&
      !shapeDefOf(ctx.catalog, args.item)?.resizedTo
    const draft = parsePlaced(ctx.catalog, resizable && args.w !== undefined ? { ...base, w: args.w } : base)
    if (!draft) return null
    const size = placedSize(ctx.catalog, draft)
    const item = resizable && size ? parsePlaced(ctx.catalog, { ...draft, w: size.w, h: args.h ?? size.h }) : draft
    const sized = item && placedSize(ctx.catalog, item)
    if (!item || !sized || !shapeThemeFits(ctx.catalog, page.type, item)) return null
    const parent = args.parent ?? null
    const push = args.crowd === "push"
    const grows = new Set(parent === null ? [] : [parent, ...ancestorsOf(page, parent)])
    // at に置いたブックと、置いた形と、動いたほかの形
    const tryAt = (at: Point) => {
      const next =
        parent === null
          ? placeItem(ctx.catalog, book, args.page, { ...item, ...at })
          : placeChild(ctx.catalog, book, args.page, parent, item, at)
      const placed = next ? findPage(next, args.page)?.page : undefined
      const found = placed && findShape(placed, item.id)?.shape
      return next && placed && found
        ? { next, found, moved: movedShapes(ctx.catalog, page, placed, new Set(), grows) }
        : null
    }
    // 置けて、refuse ならほかの形を動かさない空き
    const calm = (at: Point) => {
      const tried = tryAt(at)
      return tried !== null && (push || tried.moved.length === 0)
    }
    const at = args.at ?? freeAt(ctx.catalog, page, parent, sized, calm)
    if (!at)
      return {
        declined: `there is no free spot for it${push ? "" : ' (crowd "push" pushes the others)'}`,
        kind: NO_FREE_SPOT,
      }
    const tried = tryAt(at)
    if (!tried) return null
    if (!push && tried.moved.length > 0)
      return crowded(ctx.catalog, page, tried.moved, freeAt(ctx.catalog, page, parent, sized, calm))
    return { next: tried.next, result: { item: item.id, at: { x: tried.found.x, y: tried.found.y } } }
  },
})

// コピーしたアイテム（写し）を貼る。写しはアイテムのデータそのもの（read_book が返す形と同じ）で、id は貼るときにブックで重ならない新しい id に振り直す（子・中身・線の両端も）。
// 置き方は item-place と同じ（at は写しの範囲の左上。parent があれば親の左上から。無ければ最初の空き。crowd）
export const ITEM_PASTE = kit.defineAction({
  id: "item-paste",
  attach: ON_PAPER,
  aiDescription:
    "Paste copied items onto a page: shapes is the items' data as read_book returns it (each with its children and contents, x and y being the top-left on the paper where they were copied), connectors the lines joined to them (both ends among the shapes). Every id is made new, so the same items can be pasted again. The group's bounding box goes with its top-left at at (in paper pixels; from the parent's top-left with parent, the id of a shape that can hold children, which the shapes become the last children of); the shapes keep their places relative to one another. Without at, it goes in the first free spot of the parent (or of the page). Items the book cannot use, themes its book type does not list, and items that cannot be copied are refused. Coming within 8 pixels of another shape would move it: " +
    CROWD_AI +
    " It is refused if it does not fit on the paper. Returns the new root shapes' ids (items) and the at it used.",
  title: "Paste items",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    parent: z.string().min(1).optional(),
    at: PointSchema.optional(),
    crowd: CrowdSchema,
    shapes: z.array(z.record(z.string(), z.unknown())).min(1),
    connectors: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    const done = pasted(ctx.catalog, book, ctx.newId, args)
    if (!done) return null
    if ("declined" in done) return done
    return { next: done.next, result: { items: done.items, at: done.at } }
  },
})

// アイテムを by だけ動かす（items.ts の moveItems。1 つなら正面の相手と入れ替え・手前へ戻す、何個かならまとめて手前へ戻す）。収まらなければ断る
export const ITEM_MOVE = kit.defineAction({
  id: "item-move",
  attach: ON_PAPER,
  aiDescription:
    "Move items of a page by (x, y) paper pixels. It is refused if any would leave the paper. Children (shapes inside a parent) move inside their parent's child area (below its caption and body; it has no right or bottom edge, the parent grows to hold them and pushes the page's shapes). Items of the page and children, or children of different parents, are not moved together. Without crowd, it is refused unless the items end exactly where asked and no other shape moves (the refusal names the shapes in the way). With crowd \"push\" it moves as the screen's drag does: moving one shape at least half into the shape ahead of it swaps them; coming within 8 pixels of a shape otherwise stops it just before that shape.",
  title: "Move items",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
    by: PointSchema,
    came: z.record(z.string(), z.enum(DIRS)).optional(), // ドラッグの通り道で覚えた、相手ごとの先端が来た向き（drag.ts）
    crowd: CrowdSchema, // push ならドラッグと同じ（入れ替え・手前で止める）。refuse なら、言われた所に着かない・ほかの形が動くとき断る
  }),
  permissionScope: { page: "page", items: "items" },
  run: (book, args, ctx) => {
    const next = moveItems(ctx.catalog, book, args.page, args.items, args.by, args.came)
    if (!next || args.crowd === "push") return next && { next, result: {} }
    const page = findPage(book, args.page)?.page
    const moved = findPage(next, args.page)?.page
    if (!page || !moved) return null
    const before = allRectsOf(ctx.catalog, page)
    const after = allRectsOf(ctx.catalog, moved)
    const free = new Set(args.items.flatMap(id => [...subtreeOf(page, id)]))
    const short = args.items.filter(id => {
      const [was, now] = [before.get(id), after.get(id)]
      return !was || !now || now.x !== was.x + args.by.x || now.y !== was.y + args.by.y
    })
    const grows = new Set(args.items.flatMap(id => ancestorsOf(page, id)))
    const others = movedShapes(ctx.catalog, page, moved, free, grows)
    if (others.length > 0) return { declined: `it would move ${others.join(", ")}` }
    if (short.length > 0)
      return { declined: `${short.join(", ")} would stop short of where asked: another shape is in the way` }
    return { next, result: {} }
  },
})

// 形を、子を持てる形の中へ移す・ページへ出す（付け替え）。紙の上の位置は変えず（at を渡せば、紙の上のそこへ）、子孫と、つながる線も一緒に移る。
// 中では、子の領域より左や上なら子の領域の左上へ寄せ、兄弟を押す（placeChild）。親は子が入る大きさに育ち、ページの形を押す。
// 自分か自分の子孫の中へ・子を持てない形の中へ・今と同じ親へは断る。紙に収まらなければ断る
export const ITEM_REPARENT = kit.defineAction({
  id: "item-reparent",
  attach: ON_PAPER,
  aiDescription:
    "Move a shape into a shape that can hold children (parent: its id) or out to the page (parent: null), keeping where it is on the paper (or putting its top-left at at, in paper pixels); its children and the lines joined to them come along. Inside, it goes in the parent's child area (moved there if it is left of or above it), and the parent grows to hold it. Coming within 8 pixels of another shape would move it: " +
    CROWD_AI +
    " Pushed shapes move as in @matomezu/paper:item-place. It is refused into itself or its children, into a shape that cannot hold children, into the parent it is already in, or when it does not fit on the paper.",
  title: "Reparent item",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    parent: z.string().min(1).nullable(), // 入れる先の形の id（null はページ）
    at: PointSchema.optional(), // 移したあとの左上（紙の上。無ければ今の所）
    crowd: CrowdSchema,
  }),
  permissionScope: { page: "page", item: "item" },
  run: (book, args, ctx) => {
    const page = findPage(book, args.page)?.page
    const found = page && findShape(page, args.item)
    if (!page || !found || found.parent === args.parent) return null
    // 抜いたページ（線の整えはまだかけない。抜いた形につながる線を残すため）
    const out = replaceShape(page, args.item, () => null)
    const without = out && putPage(book, out)
    if (!out || !without) return null
    const shape = found.shape
    // 入れる先は抜いたあとのページで探す（自分か自分の子孫の中へは、見つからないので断る）
    const into = args.parent === null ? null : findShape(out, args.parent)
    if (args.parent !== null && !into) return null
    const origin = into?.at ?? { x: 0, y: 0 }
    const free = subtreeOf(page, args.item)
    const grows = new Set([
      ...ancestorsOf(page, args.item),
      ...(into ? [into.shape.id, ...ancestorsOf(out, into.shape.id)] : []),
    ])
    // 紙の上の where へ移したブックと、動いたほかの形
    const tryAt = (where: Point) => {
      const next = into
        ? placeChild(ctx.catalog, without, args.page, into.shape.id, shape, {
            x: where.x - origin.x,
            y: where.y - origin.y,
          })
        : placeItem(ctx.catalog, without, args.page, { ...shape, ...where })
      const after = next ? findPage(next, args.page)?.page : undefined
      return next && after ? { next, moved: movedShapes(ctx.catalog, page, after, free, grows) } : null
    }
    const tried = tryAt(args.at ?? found.at)
    if (!tried) return null
    if (args.crowd === "push" || tried.moved.length === 0) return { next: tried.next, result: {} }
    // 添える空き（入れる先の中の、ほかの形を動かさない所。紙の上の位置）
    const size = placedSize(ctx.catalog, shape)
    const calm = (at: Point) => tryAt({ x: at.x + origin.x, y: at.y + origin.y })?.moved.length === 0
    const spot = size && freeAt(ctx.catalog, out, args.parent, size, calm)
    return crowded(ctx.catalog, page, tried.moved, spot ? { x: spot.x + origin.x, y: spot.y + origin.y } : null)
  },
})

// アイテムの項目を変える。props に書いた項目だけを変え、書かなかった項目はそのまま。null を書いた項目は消す（既定に戻す）。
// 形に当てるテーマ（theme）はページのタイプが使えるものだけ（渡したときだけ確かめる。残っている使えないテーマは、ほかの項目を変えても断らない）。形のキャプションが変わったら、20 字まで見える幅まで右へ広げ（base/place/items.ts の widenForCaption。狭めはしない）、
// 近づきすぎた相手を押す。押した相手が紙に収まらなければ、広げずに変える。項目の形に合わなければ断る
export const ITEM_UPDATE = kit.defineAction({
  id: "item-update",
  attach: ON_PAPER,
  aiDescription:
    "Change some props of a shape (also a child inside a parent; a connector is changed with its own actions). Props not given stay; a prop given as null is removed (back to its default). The shape's size does not change, except that a shape whose caption grows widens to show it (as far as the shape lets its caption widen it), pushing the shapes it would come too close to (when they would leave the paper, it stays as wide). When a shape's caption or body grows so its children's area moves down, its children move down with it, keeping how they lie.",
  title: "Update item",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
  }),
  permissionScope: { page: "page", item: "item" },
  run: (book, args, ctx) => {
    const page = findPage(book, args.page)?.page
    const now = page && findShape(page, args.item)?.shape
    if (!now) return null
    const props = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const parsed = parsePlaced(ctx.catalog, { ...now, props })
    // テーマは、渡した props に書いたときだけ確かめる（使えないテーマが残っていても、ほかの項目は直せる）
    const given = {
      item: now.item,
      props: Object.fromEntries(Object.entries(args.props).filter(([, v]) => v !== null)),
    }
    if (!parsed || !page || !shapeThemeFits(ctx.catalog, page.type, given)) return null
    const item =
      (shapeDefOf(ctx.catalog, parsed.item)?.[kit.name("settle")]?.(parsed, now) as PlacedShape | undefined) ?? parsed
    const wide = widenForCaption(ctx.catalog, page, now, item)
    const next =
      replaceAnywhere(ctx.catalog, book, page, wide, false) ??
      (wide !== item ? replaceAnywhere(ctx.catalog, book, page, item, false) : null)
    return next && { next, result: {} }
  },
})

// アイテムの大きさを変える（大きさを変えられるアイテムだけ）。渡した値だけを変える。x・y を渡せば左上も動かす（左や上の辺をつかんで変えるとき）。
// 近づきすぎた相手は、育った向きに押してどけ、押した列が紙からはみ出すなら、押された形を縮めて収める（base/place/items.ts の replacePushing）。
// 大きさを項目に写す形（定義の resizedTo）は、w・h を書かずに写した項目にし、求めた幅にならなければ（項目の取れる範囲の外）断る。
// 一番小さい大きさより小さい・紙からはみ出す・縮めても収まらないなら断る
export const ITEM_RESIZE = kit.defineAction({
  id: "item-resize",
  attach: ON_PAPER,
  aiDescription:
    "Change the size of an item that can be resized: only w and h given change; x and y move its top-left too. An item whose height comes from its contents (such as a picture with its caption under it) changes only its width: its height follows the width, and h and y are ignored. An item that keeps its proportions (such as a scrap, whose size is its area × scale) changes by w alone: h is ignored, its height follows, and a w its own limits cannot give is refused. A child stays in its parent's child area (x and y are from the parent's top-left) and pushes the other children, which do not shrink; its parent grows to hold it and pushes the page's shapes. Shapes it would come within 8 pixels of are pushed the way it grew; when they reach the paper's edge, the pushed shapes shrink (no narrower than their caption, no lower than one caption line). It is refused below the item's smallest size, off the paper, or when they cannot shrink enough.",
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
  permissionScope: { page: "page", item: "item" },
  run: (book, args, ctx) => {
    const page = findPage(book, args.page)?.page
    const now = page && findShape(page, args.item)?.shape
    if (!page || !now || !ctx.catalog.items.get(now.item)?.capabilities.includes("resizable")) return null
    const size = placedSize(ctx.catalog, now)
    if (!size) return null
    const def = shapeDefOf(ctx.catalog, now.item)
    const stretch = def?.[kit.name("stretch")]
    const widthOnly = stretch === "width"
    const moved = { ...now, x: args.x ?? now.x, y: widthOnly ? now.y : (args.y ?? now.y) }
    const wanted = { w: args.w ?? size.w, h: widthOnly || stretch === "ratio" ? size.h : (args.h ?? size.h) }
    const resized = parsePlaced(
      ctx.catalog,
      def?.resizedTo ? (def.resizedTo(moved as ShapeData, wanted) as PlacedShape) : { ...moved, ...wanted },
    )
    // 項目に写した形は、求めた幅になったか（切り上げの 1px は許す）
    const got = resized && def?.resizedTo ? placedSize(ctx.catalog, resized) : null
    if (got && Math.abs(got.w - wanted.w) > 1) return null
    // 幅だけの形は、新しい幅で決まる高さにする
    const fitted = resized && widthOnly ? placedSize(ctx.catalog, resized) : null
    const item = resized && fitted ? { ...resized, h: fitted.h } : resized
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
    "Remove items (shapes, connectors, and children inside a parent) from a page. Removing a shape removes its children and the connectors joined to any of them.",
  title: "Remove items",
  target: "book",
  args: z.strictObject({ page: z.string().min(1), items: z.array(z.string().min(1)).min(1) }),
  permissionScope: { page: "page", items: "items" },
  run: (book, args, ctx) => {
    const next = removeItems(ctx.catalog, book, args.page, args.items)
    return next && { next, result: {} }
  },
})
