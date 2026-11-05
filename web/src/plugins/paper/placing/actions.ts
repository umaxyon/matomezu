// 紙のページにアイテムを置く・動かすアクション

import { z } from "zod"
import {
  bookItems,
  type CoreCatalog,
  type Declined,
  findShape,
  hasPages,
  type ItemPage,
  type PlacedShape,
  type Point,
  putPage,
  replaceShape,
  type ShapeData,
} from "../../../plugin-api"
import {
  allRectsOf,
  knownTheme,
  nextItemId,
  placeChild,
  placedSize,
  placeItem,
  removeItems,
  replaceChild,
  replacePushing,
  settleChildren,
  shapeDefOf,
  widenForCaption,
} from "../../base"
import { kit } from "../kit"
import { DIRS } from "./drag"
import { freeAt, moveItems, parsePlaced, subtreeOf } from "./items"

// 項目を変えたあとに形が中身を整えるメソッド（定義オブジェクトの拡張ポイントに、紙のプラグインの id を頭に付けて書き足す）。
// before は変える前の形。無ければそのまま
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    "@matomezu/paper:settle"?(item: D, before?: D): D
    // 大きさを変えられる向き: "width" なら幅だけ（高さは中身から決まる形。つかめるのは左右の辺だけで、高さは置いた大きさのまま）。無ければ幅も高さも
    "@matomezu/paper:stretch"?: "width"
  }
}

const PointSchema = z.strictObject({ x: z.number(), y: z.number() })

// item-place が空きを探して見つからなかった断りの種類（Declined の kind）
const NO_FREE_SPOT = kit.name("no-free-spot")

// ほかの形とぶつかるときの扱い: refuse は断る（ほかの形を動かさない。既定）、push は押してどける（画面の置く・動かす）
const CrowdSchema = z.enum(["refuse", "push"]).optional()
const CROWD_AI =
  'crowd "push" pushes the other shapes out of the way instead (as the screen does); without it (crowd "refuse"), it is refused when another shape would move, and the refusal names those shapes and a free spot.'

// 形 id の祖先（親から上へ）
function ancestorsOf(page: ItemPage, id: string): string[] {
  const parent = findShape(page, id)?.parent
  return parent ? [parent, ...ancestorsOf(page, parent)] : []
}

// ページ page を next に変えたとき、紙の上で動いた・大きさの変わった形（free は問わない形、grows は大きさだけ変わってよい形）
function movedShapes(
  catalog: CoreCatalog,
  page: ItemPage,
  next: ItemPage,
  free: ReadonlySet<string>,
  grows: ReadonlySet<string>,
): string[] {
  const after = allRectsOf(catalog, next)
  return [...allRectsOf(catalog, page)].flatMap(([id, r]) => {
    const now = after.get(id)
    if (free.has(id) || !now) return []
    const moved = now.x !== r.x || now.y !== r.y || (!grows.has(id) && (now.w !== r.w || now.h !== r.h))
    return moved ? [id] : []
  })
}

// 断りに添える、空きの知らせ（spot は、そこへ置けばほかの形を動かさない空き。無ければ crowd "push" を案内する）
const spotText = (spot: Point | null): string =>
  spot
    ? `; a free spot there: at ${JSON.stringify(spot)}`
    : '; there is no free spot there (crowd "push" pushes the others)'

// ほかの形を動かす moved を断った訳（そのうち子を持てる形へ入れる parent と、空きの知らせ）
function crowded(catalog: CoreCatalog, page: ItemPage, moved: readonly string[], spot: Point | null): Declined {
  const nests = moved.filter(id => {
    const shape = findShape(page, id)?.shape
    return shape && catalog.items.get(shape.item)?.capabilities.includes("nests")
  })
  const into = nests.map(id => `; ${id} can hold children: pass parent "${id}" to put it inside`).join("")
  return { declined: `it would move ${moved.join(", ")}${into}${spotText(spot)}` }
}

// 置くアイテムは、ブックで使えるアイテムだけ。項目は props（そのアイテムの項目の形で確かめる。書かなかった項目は既定。テーマは表にあるものだけ）。
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
    " Pushed shapes go right, or else down, or else shrink as they are pushed; a parent that grows pushes the page's shapes the same way. It is refused if it does not fit on the paper (on a variable page, the papers it has plus a blank one each way it grows; see page-add). Returns the new item's id and its at. To see where shapes are drawn (their size as drawn), read_page. The items, their props and sizes, the themes and the colors are in actions.",
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
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    if (!page || !bookItems(ctx.catalog, book).includes(args.item)) return null
    const props = ctx.catalog.items.get(args.item)?.props.safeParse(args.props ?? {})
    if (!props?.success) return null
    const base = { id: nextItemId(book, ctx.newId), item: args.item, x: 0, y: 0, props: props.data }
    const resizable = ctx.catalog.items.get(args.item)?.capabilities.includes("resizable")
    const draft = parsePlaced(ctx.catalog, resizable && args.w !== undefined ? { ...base, w: args.w } : base)
    if (!draft) return null
    const size = placedSize(ctx.catalog, draft)
    const item = resizable && size ? parsePlaced(ctx.catalog, { ...draft, w: size.w, h: args.h ?? size.h }) : draft
    const sized = item && placedSize(ctx.catalog, item)
    if (!item || !sized || !knownTheme(ctx.catalog, item)) return null
    const parent = args.parent ?? null
    const push = args.crowd === "push"
    const grows = new Set(parent === null ? [] : [parent, ...ancestorsOf(page, parent)])
    // at に置いたブックと、置いた形と、動いたほかの形
    const tryAt = (at: Point) => {
      const next =
        parent === null
          ? placeItem(ctx.catalog, book, args.page, { ...item, ...at })
          : placeChild(ctx.catalog, book, args.page, parent, item, at)
      const placed = next?.pages.find(p => p.id === args.page)
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
    const at = args.at ?? freeAt(ctx.catalog, book, page, parent, sized, calm)
    if (!at)
      return {
        declined: `there is no free spot for it${push ? "" : ' (crowd "push" pushes the others)'}`,
        kind: NO_FREE_SPOT,
      }
    const tried = tryAt(at)
    if (!tried) return null
    if (!push && tried.moved.length > 0)
      return crowded(ctx.catalog, page, tried.moved, freeAt(ctx.catalog, book, page, parent, sized, calm))
    return { next: tried.next, result: { item: item.id, at: { x: tried.found.x, y: tried.found.y } } }
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
    if (!hasPages(book)) return null
    const next = moveItems(ctx.catalog, book, args.page, args.items, args.by, args.came)
    if (!next || args.crowd === "push") return next && { next, result: {} }
    const page = book.pages.find(p => p.id === args.page)
    const moved = next.pages.find(p => p.id === args.page)
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
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
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
      const after = next?.pages.find(p => p.id === args.page)
      return next && after ? { next, moved: movedShapes(ctx.catalog, page, after, free, grows) } : null
    }
    const tried = tryAt(args.at ?? found.at)
    if (!tried) return null
    if (args.crowd === "push" || tried.moved.length === 0) return { next: tried.next, result: {} }
    // 添える空き（入れる先の中の、ほかの形を動かさない所。紙の上の位置）
    const size = placedSize(ctx.catalog, shape)
    const calm = (at: Point) => tryAt({ x: at.x + origin.x, y: at.y + origin.y })?.moved.length === 0
    const spot = size && freeAt(ctx.catalog, without, out, args.parent, size, calm)
    return crowded(ctx.catalog, page, tried.moved, spot ? { x: spot.x + origin.x, y: spot.y + origin.y } : null)
  },
})

// アイテムの項目を変える。props に書いた項目だけを変え、書かなかった項目はそのまま。null を書いた項目は消す（既定に戻す）。
// 形に当てるテーマ（theme）は表にあるものだけ。形のキャプションが変わったら、20 字まで見える幅まで右へ広げ（base/place/items.ts の widenForCaption。狭めはしない）、
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
// 近づきすぎた相手は、育った向きに押してどけ、押した列が紙からはみ出すなら、押された形を縮めて収める（base/place/items.ts の replacePushing）。
// 一番小さい大きさより小さい・紙からはみ出す・縮めても収まらないなら断る
export const ITEM_RESIZE = kit.defineAction({
  id: "item-resize",
  attach: ON_PAPER,
  aiDescription:
    "Change the size of an item that can be resized: only w and h given change; x and y move its top-left too. An item whose height comes from its contents (such as a picture with its caption under it) changes only its width: its height follows the width, and h and y are ignored. A child stays in its parent's child area (x and y are from the parent's top-left) and pushes the other children, which do not shrink; its parent grows to hold it and pushes the page's shapes. Shapes it would come within 8 pixels of are pushed the way it grew; when they reach the paper's edge, the pushed shapes shrink (no narrower than their caption, no lower than one caption line). It is refused below the item's smallest size, off the paper, or when they cannot shrink enough.",
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
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && findShape(page, args.item)?.shape
    if (!page || !now || !ctx.catalog.items.get(now.item)?.capabilities.includes("resizable")) return null
    const size = placedSize(ctx.catalog, now)
    if (!size) return null
    const widthOnly = shapeDefOf(ctx.catalog, now.item)?.[kit.name("stretch")] === "width"
    const resized = parsePlaced(ctx.catalog, {
      ...now,
      x: args.x ?? now.x,
      y: widthOnly ? now.y : (args.y ?? now.y),
      w: args.w ?? size.w,
      h: widthOnly ? size.h : (args.h ?? size.h),
    })
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
    if (!hasPages(book)) return null
    const next = removeItems(ctx.catalog, book, args.page, args.items)
    return next && { next, result: {} }
  },
})
