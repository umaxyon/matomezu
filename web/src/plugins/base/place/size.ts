// 置いた形の大きさ: 置く前の大きさと一番小さい大きさ、辺をつかんで変えた大きさ、キャプションが見える所まで広げる大きさ、編集で縮めてよい下限
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ShapeData } from "../../../core/def/item"
import type { Point, Size } from "../../../core/geom"
import { type ItemPage, type PlacedShape, shapesOf } from "../../../core/placed"
import { settingsAt } from "../book-settings"
import { roomOf } from "./grow"
import { childrenSize, placedSize, shapeDefOf } from "./placed"
import type { Floors } from "./push"

// 置く前のアイテムの大きさ（定義の大きさ。表に無いアイテムと、大きさを持たないアイテムは null）
export function itemSize(catalog: CoreCatalog, item: string): Size | null {
  return shapeDefOf(catalog, item)?.size ?? null
}

// 大きさを変えられるアイテムの、一番小さい大きさ（変えられないアイテムは null）
export function minSize(catalog: CoreCatalog, item: PlacedShape): Size | null {
  return shapeDefOf(catalog, item.item)?.min ?? null
}

// キャプションが切れずに見える幅（編集で縮めてよい横の下限と、キャプションで広げる幅。表に無いアイテムは 0）
const captionWidth = (catalog: CoreCatalog, item: PlacedShape): number => {
  const def = shapeDefOf(catalog, item.item)
  return def ? (def.captionWidth?.(item) ?? def.size.w) : 0
}

// キャプションが切れずに見える高さ（定義の captionHeight。無ければ null で、縦にはキャプションで広げない）
const captionHeight = (catalog: CoreCatalog, item: PlacedShape): number | null =>
  shapeDefOf(catalog, item.item)?.captionHeight?.(item) ?? null

// つかんだ辺（x は左か右、y は上か下。角なら両方）
export interface Edges {
  x?: "left" | "right"
  y?: "top" | "bottom"
}

// 辺をつかんで、紙の上で by だけ動かしたときの左上と大きさ。つかんでいない辺はそのまま。
// 一番小さい大きさより小さくせず（子を持つ形は、子がみな入る大きさより小さくしない）、紙の外へは広げない（変えられないアイテムは null）。
// ratio なら、つかめるのは角だけで（辺なら null）、向かいの角を止めて幅と高さの比を保つ（幅と高さのうち、大きく変わった方の割合に合わせる）。
// 大きさを項目に写す形（定義の resizedTo）は、写した項目から決まる大きさにする（離したあとの大きさと同じ）
export function resizedBy(
  catalog: CoreCatalog,
  item: PlacedShape,
  edges: Edges,
  by: Point,
  paper: Size,
  ratio = false,
): { x: number; y: number; w: number; h: number } | null {
  const own = minSize(catalog, item)
  const size = placedSize(catalog, item)
  if (!own || !size) return null
  const children = childrenSize(catalog, item)
  const min = children ? { w: Math.max(own.w, children.w), h: Math.max(own.h, children.h) } : own
  if (ratio) {
    if (!edges.x || !edges.y) return null
    const right = edges.x === "right"
    const bottom = edges.y === "bottom"
    // 止めた角から紙の端までの広さ
    const room = { w: right ? paper.w - item.x : item.x + size.w, h: bottom ? paper.h - item.y : item.y + size.h }
    // 幅と高さのうち、大きく変わった方の割合に合わせる（横だけ・縦だけに引いても変わる）
    const fw = (size.w + (right ? by.x : -by.x)) / size.w
    const fh = (size.h + (bottom ? by.y : -by.y)) / size.h
    const grown = Math.abs(fw - 1) >= Math.abs(fh - 1) ? fw : fh
    const f = Math.min(Math.max(grown, min.w / size.w, min.h / size.h), room.w / size.w, room.h / size.h)
    const wanted = { w: size.w * f, h: size.h * f }
    const to = shapeDefOf(catalog, item.item)?.resizedTo
    const next = to ? placedSize(catalog, to(item as ShapeData, wanted) as PlacedShape) : wanted
    if (!next) return null
    return {
      x: right ? item.x : item.x + size.w - next.w,
      y: bottom ? item.y : item.y + size.h - next.h,
      w: next.w,
      h: next.h,
    }
  }
  const span = (start: number, len: number, d: number, side: "start" | "end" | undefined, lo: number, max: number) => {
    if (side === "end") return { at: start, len: Math.min(Math.max(len + d, lo), max - start) }
    if (side !== "start") return { at: start, len }
    const end = start + len
    const at = Math.max(Math.min(start + d, end - lo), 0)
    return { at, len: end - at }
  }
  const h = span(item.x, size.w, by.x, edges.x && (edges.x === "left" ? "start" : "end"), min.w, paper.w)
  const v = span(item.y, size.h, by.y, edges.y && (edges.y === "top" ? "start" : "end"), min.h, paper.h)
  const rect = { x: h.at, y: v.at, w: h.len, h: v.len }
  // 大きさを項目に写す形は、写した項目から決まる大きさにし、つかんでいない側の辺を止める
  const to = shapeDefOf(catalog, item.item)?.resizedTo
  const next = to ? placedSize(catalog, to(item as ShapeData, rect) as PlacedShape) : null
  if (!next) return rect
  return {
    x: edges.x === "left" ? item.x + size.w - next.w : rect.x,
    y: edges.y === "top" ? item.y + size.h - next.h : rect.y,
    w: next.w,
    h: next.h,
  }
}

// 中身を変えた形 next の大きさ: キャプションの項目（定義の captionProp）が変わって、キャプションが見える幅（20 字まで）より狭ければ、そこまで広げる。
// 文字を縦に置く形（定義の captionHeight を持つ形）は、見える高さまで縦にも広げる。
// 広げる向きはページのタイプの growFrom（無ければ左・上を保って右・下へ。center なら真ん中を保って両側へ）で、紙からははみ出さない。
// 狭めはしない。キャプションが変わらないか、captionProp の無い形ならそのまま
export function widenForCaption(
  catalog: CoreCatalog,
  page: ItemPage,
  before: PlacedShape,
  next: PlacedShape,
): PlacedShape {
  const prop = shapeDefOf(catalog, next.item)?.captionProp
  if (prop === undefined) return next
  const caption = (p: PlacedShape) => (p.props as Record<string, unknown>)[prop]
  if (caption(next) === caption(before)) return next
  const size = placedSize(catalog, next)
  const paper = roomOf(catalog, page)
  if (!size) return next
  const from = catalog.pageTypes.get(page.type)?.growFrom?.(settingsAt(catalog, page))
  // 1 つの向きに、want まで広げた位置と長さ（at は左か上、len は今の長さ、room は紙の長さ）
  const grow = (at: number, len: number, want: number, room: number, center: boolean) => {
    const to = Math.min(want, center ? room : room - at)
    if (to <= len) return { at, len }
    return { at: center ? Math.min(Math.max(0, Math.round(at - (to - len) / 2)), room - to) : at, len: to }
  }
  const x = grow(next.x, size.w, captionWidth(catalog, next), paper.w, from?.x === "center")
  const tall = captionHeight(catalog, next)
  const y = tall === null ? { at: next.y, len: size.h } : grow(next.y, size.h, tall, paper.h, from?.y === "center")
  if (x.len === size.w && y.len === size.h) return next
  return { ...next, x: x.at, y: y.at, w: x.len, h: y.len }
}

// 編集で縮めてよい下限（紙に収める）: 横がキャプションが全部見える幅、縦が一番低い高さ（箱はキャプション 1 行、リストは見出しと「＋」の行。
// 文字を縦に置く形はキャプションが全部見える高さ）。子を持つ形は、子がみな入る大きさより小さくしない（placed.ts の childrenSize）。
// 今それより小さければ今の大きさ。大きさを項目に写す形は、今の大きさ（縮めない）
export function floorsOf(catalog: CoreCatalog, page: ItemPage): Floors {
  const floors = new Map<string, Size>()
  for (const i of shapesOf(page)) {
    const size = placedSize(catalog, i)
    if (!size) continue
    // 大きさを項目に写す形（定義の resizedTo）は、押されても縮まない（w・h を書いても、大きさは項目から決まるため）
    if (shapeDefOf(catalog, i.item)?.resizedTo) {
      floors.set(i.id, size)
      continue
    }
    const children = childrenSize(catalog, i) ?? { w: 0, h: 0 }
    floors.set(i.id, {
      w: Math.min(size.w, Math.max(children.w, captionWidth(catalog, i))),
      h: Math.min(size.h, Math.max(children.h, captionHeight(catalog, i) ?? (minSize(catalog, i) ?? size).h)),
    })
  }
  return floors
}
