// 紙のビューの選択の決まり: Mod+クリックで足す・外す、選んでいる物の 1 つを修飾なしで押して動かさずに離したら、その 1 つに選び直す。
// 選択の道具で何も無い所からドラッグした範囲（sweep）では、範囲にかかったページの形と、両端がどちらもその形のつなぐものを選ぶ
import { type CoreCatalog, connectorsOf, findShape, type ItemPage, type Point, type Rect } from "../../../plugin-api"
import { rectsOf } from "../../base"

// 物 id を押したときの選び方: 押した時点の選択 now、ドラッグで動かす物 drag、動かさずに離したときの選択 release（変えなければ null）
export interface Press {
  now: readonly string[]
  drag: readonly string[]
  release: readonly string[] | null
}

// 選択 selection で物 id を押したときの選び方（mod は Mod を押しているか）
export function pressSelection(selection: readonly string[], id: string, mod: boolean): Press {
  const has = selection.includes(id)
  if (mod && has) return { now: selection, drag: selection, release: selection.filter(s => s !== id) }
  if (mod) {
    const now = [...selection, id]
    return { now, drag: now, release: null }
  }
  if (has) return { now: selection, drag: selection, release: selection.length > 1 ? [id] : null }
  return { now: [id], drag: [id], release: null }
}

// 選んだ物 ids のうち、ドラッグで動かす形（選択に混じったつなぐものは動かさず、両端の形に付いてくる）
export const shapesIn = (page: ItemPage, ids: readonly string[]): readonly string[] =>
  ids.filter(id => findShape(page, id) !== undefined)

// 範囲のドラッグで、押した点 a と今の点 b（紙の上）を角にする四角
export const sweptBox = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
})

// 紙の上の範囲 box に少しでもかかったページの形（子の形は入れない）と、両端がどちらもその形のつなぐもの
export function sweptItems(catalog: CoreCatalog, page: ItemPage, box: Rect): string[] {
  const hit = (r: Rect) => r.x < box.x + box.w && box.x < r.x + r.w && r.y < box.y + box.h && box.y < r.y + r.h
  const shapes = new Set([...rectsOf(catalog, page)].filter(([, r]) => hit(r)).map(([id]) => id))
  const connectors = connectorsOf(page).filter(c => shapes.has(c.from) && shapes.has(c.to))
  return [...shapes, ...connectors.map(c => c.id)]
}

// 範囲のドラッグの選択: Mod なら押す前の選択 base に足し、でなければ範囲の中の物 swept だけ
export const sweptSelection = (base: readonly string[], swept: readonly string[], mod: boolean): readonly string[] =>
  mod ? [...base, ...swept.filter(h => !base.includes(h))] : swept
