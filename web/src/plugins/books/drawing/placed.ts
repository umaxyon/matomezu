// 図面に置けるアイテムの表と、図面のページのデータの形。置き方の層（items）は、アイテムの置き方をここから引く（items/placed-def.ts の約束）。
// ページのアイテムは、紙の上に四角を占める形（箱・リスト）と、形どうしを結ぶ線。置き方の層は形だけを並べ、線のことはここの入口
// （組ごとの間隔 gapOf・形が変わったあとの整え tidyPage）を通して知る。
// 形を足すときは、その形の置き方を書いて、ここに並べる
import { z } from "zod"
import type { Registry } from "../../../core/registry"
import { PageSchema } from "../../../core/schema/page"
import { BOX_PLACED, PlacedBoxSchema } from "./box/placed"
import type { PlacedDef } from "./items/placed-def"
import { GAP, type Gap, type Rect } from "./items/push"
import { LINE } from "./line"
import { DEFAULT_ROUTE, lineGaps, linesHold, type PlacedLine, PlacedLineSchema, tidyLines } from "./line/placed"
import { LIST_PLACED, PlacedListSchema } from "./list/placed"

// 置いた形のデータ。形の種類（item）ごとに、その形の形
export const PlacedSchema = z.discriminatedUnion("item", [PlacedBoxSchema, PlacedListSchema])
export type Placed = z.infer<typeof PlacedSchema>

// ページのアイテム（形と線）
export const PageItemSchema = z.discriminatedUnion("item", [PlacedBoxSchema, PlacedListSchema, PlacedLineSchema])
export type PageItem = z.infer<typeof PageItemSchema>

// 図面のページ。items が無ければ、何も置いていない
export const DrawingPageSchema = PageSchema.extend({ items: z.array(PageItemSchema).optional() })
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

export const isShape = (item: PageItem): item is Placed => item.item in PLACED

// ページのアイテム全部（形と線。重ねの順）
export const pageItemsOf = (page: DrawingPage): readonly PageItem[] => page.items ?? []
// ページの形（重ねの順）
export const shapesOf = (page: DrawingPage): readonly Placed[] => pageItemsOf(page).filter(isShape)
// ページの線
export const linesOf = (page: DrawingPage): readonly PlacedLine[] =>
  pageItemsOf(page).filter((i): i is PlacedLine => i.item === LINE.id)

// ページの、2 つの形の組の間隔の下限（線でつながった組は広い）
export const gapOf = (page: DrawingPage): Gap => lineGaps(linesOf(page), GAP)

// 形が変わったあとのページ: 端の形が無くなった線を消し、引けなくなった手で直した区間を消す（rects は形の四角）
export function tidyPage(page: DrawingPage, rects: ReadonlyMap<string, Rect>): DrawingPage {
  const lines = linesOf(page)
  if (lines.length === 0) return page
  const tidy = new Map(tidyLines(lines, rects, DEFAULT_ROUTE === "elbow").map(l => [l.id, l] as const))
  const now = pageItemsOf(page)
  const items = now.flatMap((i): PageItem[] => {
    if (isShape(i)) return [i]
    const l = tidy.get(i.id)
    return l ? [l] : []
  })
  return items.length === now.length && items.every((i, k) => i === now[k]) ? page : { ...page, items }
}

// 図面のブックの、データの形の外の決まり: どのページも、線の両端がそのページのつなげる形にあり、同じ組に 2 本無い
export function drawingHolds(book: { pages: readonly DrawingPage[] }, reg: Registry): boolean {
  return book.pages.every(page => {
    const shapes = new Map(shapesOf(page).map(s => [s.id, s.item]))
    const connectable = (id: string) => {
      const item = shapes.get(id)
      return item !== undefined && (reg.items.get(item)?.capabilities.includes("connectable") ?? false)
    }
    return linesHold(linesOf(page), connectable)
  })
}
