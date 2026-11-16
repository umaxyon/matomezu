// スライドのアクション: 置く・動かす・大きさを変える・項目を変える・重ねを変える・消す。
// 対象はページの slide（形だけの並び。重ねの順）。ほかの形を押さず、紙の外に出てもよい（位置は紙の左上からの px で、負でもよい）。
// 位置と大きさは、書いたとおりに残る。アクションはスライドのアイテムを置けるタイプについて来る
import { z } from "zod"
import {
  type CoreCatalog,
  type ItemPage,
  type PlacedShape,
  type ShapeData,
  shapeSchema,
  slideOf,
} from "../../../plugin-api"
import { nextItemId } from "../../base"
import { kit } from "./kit"
import { ORDERS } from "./order"
import { scaledFontSize } from "./rect"
import {
  DEFAULT_FONT_SIZE,
  ELLIPSE,
  EllipseProps,
  FREE_LINE,
  FreeLineProps,
  SLIDE_ITEMS,
  STRAIGHT_LINE,
  StraightLineProps,
  TEXT_FRAME,
  TextFrameProps,
} from "./slide"

const ON_SLIDE = { items: SLIDE_ITEMS.map(def => def.id) }

type Shape = ShapeData<Record<string, unknown>>
const shapes = (page: ItemPage): Shape[] => slideOf(page) as unknown as Shape[]

// ページの slide を next にしたページ
const withSlide = (page: ItemPage, next: readonly Shape[]): ItemPage => ({
  ...page,
  slide: next as unknown as PlacedShape[],
})

// 形が、そのアイテムの定義の形（項目・最小の大きさ）に合うか
function fits(catalog: CoreCatalog, shape: Shape): boolean {
  const def = catalog.items.get(shape.item)
  return def?.kind === "shape" && shapeSchema(def).safeParse(shape).success
}

const round = (n: number): number => Math.round(n * 100) / 100

// slide の形 id を f で置き換えたページ。形が無いか、f が null か、合わなければ null
function change(catalog: CoreCatalog, page: ItemPage, id: string, f: (shape: Shape) => Shape | null): ItemPage | null {
  const now = shapes(page).find(s => s.id === id)
  const next = now && f(now)
  if (!next || !fits(catalog, next)) return null
  return withSlide(
    page,
    shapes(page).map(s => (s.id === id ? next : s)),
  )
}

const Common = {
  at: z.strictObject({ x: z.number(), y: z.number() }).optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
}
const place = <const I extends string, P extends z.ZodType>(item: I, props: P) =>
  z.strictObject({ ...Common, item: z.literal(item), props })

// 置く。at は左上（紙の上の px。無ければ 0, 0）。w・h が無ければアイテムの置くときの大きさ
export const SLIDE_PLACE = kit.defineAction({
  id: "slide-place",
  attach: ON_SLIDE,
  aiDescription:
    "Place a drawing item on a page's slide with its top-left at at (in paper pixels from the paper's top-left; it may be negative or outside the paper, which only shows what is inside). Items on a slide never push each other and are not joined by lines. item is a text frame (props.text), a free line (props.points, fractions of the frame), a straight line, or an ellipse. w and h set the frame (without them, the item's own size). Later items are drawn over earlier ones. Returns the new item's id.",
  title: "Place on slide",
  target: "page",
  args: z.discriminatedUnion("item", [
    place(TEXT_FRAME.id, TextFrameProps),
    place(FREE_LINE.id, FreeLineProps),
    place(STRAIGHT_LINE.id, StraightLineProps.default({})),
    place(ELLIPSE.id, EllipseProps.default({})),
  ]),
  permissionScope: "page",
  run: (page, args, ctx) => {
    const def = SLIDE_ITEMS.find(d => d.id === args.item)
    if (!def) return null
    const w = args.w ?? def.size.w
    const h = args.h ?? def.size.h
    const shape: Shape = {
      id: nextItemId(page, ctx.newId),
      x: args.at?.x ?? 0,
      y: args.at?.y ?? 0,
      item: args.item,
      w,
      h,
      props: { ...args.props },
    }
    if (!fits(ctx.catalog, shape)) return null
    return { next: withSlide(page, [...shapes(page), shape]), result: { item: shape.id } }
  },
})

// 動かす。at は左上（紙の上の px）
export const SLIDE_MOVE = kit.defineAction({
  id: "slide-move",
  attach: ON_SLIDE,
  aiDescription:
    "Move a slide item so its top-left is at at (paper pixels; may be outside the paper). Nothing else moves.",
  title: "Move on slide",
  target: "page",
  args: z.strictObject({
    item: z.string().min(1),
    at: z.strictObject({ x: z.number(), y: z.number() }),
  }),
  permissionScope: { item: "item" },
  run: (page, args, ctx) => {
    const next = change(ctx.catalog, page, args.item, s => ({ ...s, x: args.at.x, y: args.at.y }))
    return next && { next, result: {} }
  },
})

// 大きさを変える。w か h の一方だけ書けば、もう一方は今のまま。at を書けば左上もその場所にする（左や上の辺を引いたとき）。scale なら文字枠の文字の大きさも幅の倍率で変える（角のつまみ）
export const SLIDE_RESIZE = kit.defineAction({
  id: "slide-resize",
  attach: ON_SLIDE,
  aiDescription:
    "Change a slide item's frame: w and/or h in pixels (the top-left stays, or moves to at). scale: true also scales a text frame's fontSize by the width's change (a corner drag); without it only the frame changes and the text wraps again.",
  title: "Resize on slide",
  target: "page",
  args: z.strictObject({
    item: z.string().min(1),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    at: z.strictObject({ x: z.number(), y: z.number() }).optional(),
    scale: z.boolean().optional(),
  }),
  permissionScope: { item: "item" },
  run: (page, args, ctx) => {
    if (args.w === undefined && args.h === undefined) return null
    const next = change(ctx.catalog, page, args.item, s => {
      const oldW = s.w ?? 0
      const oldH = s.h ?? 0
      const w = args.w ?? oldW
      const h = args.h ?? oldH
      // 文字枠の文字の大きさ（無ければ既定の 24）を、幅の倍率で変える
      const scaled = args.scale && s.item === TEXT_FRAME.id && oldW > 0
      const fontSize = typeof s.props.fontSize === "number" ? s.props.fontSize : DEFAULT_FONT_SIZE
      const props = scaled ? { ...s.props, fontSize: scaledFontSize(fontSize, w, oldW) } : s.props
      return { ...s, x: args.at?.x ?? s.x, y: args.at?.y ?? s.y, w: round(w), h: round(h), props }
    })
    return next && { next, result: {} }
  },
})

// 項目を変える。null の項目は消す（既定に戻る）
export const SLIDE_UPDATE = kit.defineAction({
  id: "slide-update",
  attach: ON_SLIDE,
  aiDescription:
    "Change some props of a slide item (text, fontSize, color, points, rotation, ...). Props not given stay; a prop given as null is removed (back to its default). Refused when the result does not fit the item's props.",
  title: "Update on slide",
  target: "page",
  args: z.strictObject({
    item: z.string().min(1),
    props: z.record(z.string().min(1), z.unknown()),
  }),
  permissionScope: { item: "item" },
  run: (page, args, ctx) => {
    const next = change(ctx.catalog, page, args.item, s => {
      const props = { ...s.props }
      for (const [k, v] of Object.entries(args.props)) {
        if (v === null) delete props[k]
        else props[k] = v
      }
      return { ...s, props }
    })
    return next && { next, result: {} }
  },
})

// 重ねを変える
export const SLIDE_REORDER = kit.defineAction({
  id: "slide-reorder",
  attach: ON_SLIDE,
  aiDescription:
    "Change where a slide item sits in the drawing order: front, back, forward or backward (one step). Later items are drawn over earlier ones.",
  title: "Reorder on slide",
  target: "page",
  args: z.strictObject({
    item: z.string().min(1),
    to: z.enum(ORDERS),
  }),
  permissionScope: { item: "item" },
  run: (page, args) => {
    const list = shapes(page)
    const from = list.findIndex(s => s.id === args.item)
    if (from < 0) return null
    const last = list.length - 1
    const to = { front: last, back: 0, forward: Math.min(from + 1, last), backward: Math.max(from - 1, 0) }[args.to]
    if (to === from) return null
    const rest = list.filter((_, i) => i !== from)
    const item = list[from] as Shape
    return { next: withSlide(page, [...rest.slice(0, to), item, ...rest.slice(to)]), result: {} }
  },
})

// 消す
export const SLIDE_REMOVE = kit.defineAction({
  id: "slide-remove",
  attach: ON_SLIDE,
  aiDescription: "Remove an item from a page's slide.",
  title: "Remove from slide",
  target: "page",
  args: z.strictObject({ item: z.string().min(1) }),
  permissionScope: { item: "item" },
  run: (page, args) => {
    if (!shapes(page).some(s => s.id === args.item)) return null
    return {
      next: withSlide(
        page,
        shapes(page).filter(s => s.id !== args.item),
      ),
      result: {},
    }
  },
})
