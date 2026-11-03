// 紙のビューの選択の決まり: Mod+クリックで足す・外す、選んでいる物の 1 つを修飾なしで押して動かさずに離したら、その 1 つに選び直す。
// 内包の階層の違う形を一緒に選ぼうとしたら、どれも同じ階層になるよう、深い形の代わりにその祖先を選ぶ（一緒に動かせるように）。
// 形の中の物（リストの行など）を選んでいるときに、ほかの物を Mod+クリックしたら、形の中の物はそれを持つ形に置き換える（形の中の物を選べるのは、同じ形の中の物どうしだけ）。
// 選択に従う右サイドパネル（伝言を書いている間など）を開いている間は、選択は付いた先を選ぶ物なので、置き換えずに混ぜて選び、押しても動かさない。
// 選択の道具で何も無い所からドラッグした範囲（sweep）では、範囲にかかったページの形と、両端がどちらもその形のつなぐものを選ぶ
import {
  type CoreCatalog,
  connectorsOf,
  findShape,
  type ItemPage,
  type Point,
  type Rect,
  walkShapes,
} from "../../../plugin-api"
import { rectsOf } from "../../base"

// 物 id を押したときの選び方: 押した時点の選択 now、ドラッグで動かす物 drag、動かさずに離したときの選択 release（変えなければ null）
export interface Press {
  now: readonly string[]
  drag: readonly string[]
  release: readonly string[] | null
}

// ページ page の選択 selection で物 id を押したときの選び方（mod は Mod を押しているか）。
// followed（選択に従う右サイドパネルを開いている間。選択は付いた先を選ぶ物）なら、階層の違う物も混ぜて選び（置き換えない）、押しても動かさない
export function pressSelection(
  page: ItemPage,
  selection: readonly string[],
  id: string,
  mod: boolean,
  followed = false,
): Press {
  const has = selection.includes(id)
  if (followed) {
    const now = !mod ? [id] : has ? selection.filter(s => s !== id) : [...selection, id]
    return { now, drag: [], release: null }
  }
  if (mod && has) return { now: selection, drag: selection, release: selection.filter(s => s !== id) }
  if (mod) {
    const now = sameLevel(page, lifted(page, [...selection, id]))
    return { now, drag: now, release: null }
  }
  if (has) return { now: selection, drag: selection, release: selection.length > 1 ? [id] : null }
  return { now: [id], drag: [id], release: null }
}

// 選んだ物 ids の、形の中の物（リストの行など）を、それを持ついちばん内側の形に置き換えたもの（同じ形は 1 つにまとめる。形とつなぐものはそのまま）
export function lifted(page: ItemPage, ids: readonly string[]): readonly string[] {
  const placed = new Set([...walkShapes(page).map(s => s.shape.id), ...connectorsOf(page).map(c => c.id)])
  const inner = [...walkShapes(page)].reverse()
  const owner = (id: string) =>
    placed.has(id) ? id : (inner.find(({ shape: { shapes: _, ...own } }) => holds(own, id))?.shape.id ?? id)
  const next = [...new Set(ids.map(owner))]
  return next.length === ids.length && next.every((id, i) => id === ids[i]) ? ids : next
}

// 値 value の中のどこかに、id が id の物があるか
const holds = (value: unknown, id: string): boolean =>
  Array.isArray(value)
    ? value.some(v => holds(v, id))
    : typeof value === "object" && value !== null
      ? Object.entries(value).some(([k, v]) => (k === "id" ? v === id : holds(v, id)))
      : false

// 選んだ物 ids の形を、どれも同じ階層にしたもの: 形ごとの祖先の並び（ページの形から親まで）の、どの形にも共通の所の 1 つ下の階層へ、
// 深い形をその祖先に置き換える（同じ形は 1 つにまとめる）。つなぐものはそのまま。同じ階層なら同じ値
export function sameLevel(page: ItemPage, ids: readonly string[]): readonly string[] {
  const ancestors = (id: string): string[] => {
    const parent = findShape(page, id)?.parent ?? null
    return parent === null ? [] : [...ancestors(parent), parent]
  }
  const chains = new Map(ids.filter(id => findShape(page, id) !== undefined).map(id => [id, ancestors(id)]))
  const all = [...chains.values()]
  let depth = 0
  while (all.length > 0 && all.every(c => c.length > depth && c[depth] === all[0]?.[depth])) depth++
  const lifted = ids.map(id => chains.get(id)?.[depth] ?? id)
  const kept = [...new Set(lifted)]
  return kept.length === ids.length && kept.every((id, i) => id === ids[i]) ? ids : kept
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
