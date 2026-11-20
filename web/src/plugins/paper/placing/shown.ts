// 紙のビューが描く形の位置と大きさ: ドラッグ中にずらして描く量、大きさを変えている途中の形、ドラッグでずらした形に合わせて一緒にずらすつなぐものの形。
// データを書き換えず、描く値を返す
import {
  type CoreCatalog,
  findShape,
  type ItemPage,
  type PlacedShape,
  type Point,
  type Rect,
  type Size,
  walkShapes,
} from "../../../plugin-api"
import type { Edges } from "../../base"
import { sizedTo, stretchedBy } from "./items"

// ドラッグ中にアイテム item をずらして描く量（紙の上）。shift はポインタの動いた量（紙の上。ドラッグしていなければ null）、plan は入れ替えを含めたドラッグ中の四角（items.ts の dragging）、dragged は動かしているアイテム
export function shiftedBy(
  item: PlacedShape,
  shift: Point | null,
  plan: ReadonlyMap<string, Rect> | null,
  dragged: readonly string[],
): Point | null {
  if (!shift) return null
  const r = plan?.get(item.id)
  if (r) return r.x !== item.x || r.y !== item.y ? { x: r.x - item.x, y: r.y - item.y } : null
  return dragged.includes(item.id) ? shift : null
}

// 描く形: 下書きを重ねたページ shownPage の形（無ければ placed）。大きさを変えている途中のアイテム（stretching。つかんだ辺と、紙の上で動いた量）は、変えたあとの左上と大きさにする
export function shownShape(
  catalog: CoreCatalog,
  shownPage: ItemPage,
  placed: PlacedShape,
  stretching: { item: string; edges: Edges; by: Point } | null,
  paper: Size | null,
): PlacedShape {
  const item = findShape(shownPage, placed.id)?.shape ?? placed
  const st = stretching
  if (!st || st.item !== item.id || !paper) return item
  const to = stretchedBy(catalog, item, st.edges, st.by, paper)
  // 大きさを項目に写す形は、写した項目で描く（w・h を書いても、大きさは項目から決まるため）
  return to ? { ...sizedTo(catalog, item, to), x: to.x, y: to.y } : item
}

// ページ page の形（子の形も）のうち、ずらして描く形と、その量（shiftOf。ずらさなければ null）
export function slidShapes(page: ItemPage, shiftOf: (item: PlacedShape) => Point | null): Map<string, Point> {
  const slid = new Map<string, Point>()
  for (const { shape } of walkShapes(page)) {
    const by = shiftOf(shape as PlacedShape)
    if (by) slid.set(shape.id, by)
  }
  return slid
}
