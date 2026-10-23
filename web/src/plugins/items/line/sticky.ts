// 前の辺に留まる線を選ぶ純粋な関数（OVERHAUL 3.2 の「線」の、箱のドラッグとの兼ね合いの場面）。
// 自由な端が前に描いた辺と位置（記憶）を、どの線に渡すかを決める。記憶は描く側（線の層）が画面の中だけに持つ
import type { Rect } from "../../../core/geom"
import type { DrawnLine } from "./drawn"
import type { PlacedLine } from "./placed"
import type { EndMemory } from "./route"

export interface StickyScene {
  lines: readonly PlacedLine[] // 描くページの線
  memo: ReadonlyMap<string, EndMemory> // 前に描いたときの記憶
  before: ReadonlyMap<string, Rect> // 前に描いたときの形の四角
  rects: ReadonlyMap<string, Rect> // 今描く形の四角
  dragged: readonly string[] // ドラッグで動かしている形
  pushed: readonly string[] // ドラッグの入れ替えでずれて描いている形
  swapped: boolean // このドラッグで入れ替えが起きたか
  settle: ReadonlySet<string> // 離したあとに付け替えを見る線（動かした形の線）
}

const sameRect = (a: Rect | undefined, b: Rect | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

// 記憶を渡す線と、その記憶:
// - 動かしている形の線は留まる（A1）。入れ替えが起きたら、そのドラッグの終わりまで留まらない（A2・A3）
// - 入れ替えでずれた形の線（A5）と、ドラッグのほかで動いた・大きさが変わった形の線（押された・AI が動かした。D1）は留まらない
// - 離したあとに付け替えを見る線（settle）は、形が動いていても記憶を渡す（留まるかは描く側が LOOSEN_BENDS で決める。A4）
export function stickyMemory(s: StickyScene): Map<string, EndMemory> {
  const movedElse = (id: string) => !s.dragged.includes(id) && !sameRect(s.before.get(id), s.rects.get(id))
  return new Map(
    s.lines.flatMap(l => {
      const m = s.memo.get(l.id)
      const ends = [l.from, l.to]
      if (!m || ends.some(id => s.pushed.includes(id))) return []
      if (s.swapped && ends.some(id => s.dragged.includes(id))) return []
      if (!s.settle.has(l.id) && ends.some(movedElse)) return []
      return [[l.id, m] as const]
    }),
  )
}

// 描いた線から、次に描くときに渡す記憶
export const memoryOf = (drawn: readonly DrawnLine[]): Map<string, EndMemory> =>
  new Map(drawn.flatMap(l => (l.memory ? [[l.id, l.memory] as const] : [])))
