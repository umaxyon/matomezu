// 前の辺に留まる線を選ぶ純粋な関数（利用者が形を動かしている間の線）。
// 自由な端が前に描いた辺と位置（記憶）を、どの線に渡すかを決める。記憶は描く側（ラインビュー）が画面の中だけに持つ
import type { Rect } from "../../../plugin-api"
import type { DrawnLine } from "./drawn"
import type { PlacedLine } from "./placed"
import type { EndMemory } from "./route"

export interface StickyScene {
  lines: readonly PlacedLine[] // 描くページの線
  memo: ReadonlyMap<string, EndMemory> // 前に描いたときの記憶
  before: ReadonlyMap<string, Rect> // 前に描いたときの形の四角
  rects: ReadonlyMap<string, Rect> // 今描く形の四角
  dragged: readonly string[] // 利用者がつかんで動かしている形
  displaced: readonly string[] // つかんでいる形の動きで、位置がずれて描かれている形
  reordered: boolean // このつかみで、形の並びが変わったか
  settle: ReadonlySet<string> // 離したあとに付け替えを見る線（動かした形の線）
}

const sameRect = (a: Rect | undefined, b: Rect | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

// 記憶を渡す線と、その記憶:
// - 動かしている形の線は留まる。形の並びが変わったら、そのつかみの終わりまで留まらない
// - つかんでいる形の動きでずれた形の線と、つかむほかで動いた・大きさが変わった形の線（押された・AI が動かした）は留まらない
// - 離したあとに付け替えを見る線（settle）は、形が動いていても記憶を渡す（留まるかは描く側が LOOSEN_BENDS で決める）
export function stickyMemory(s: StickyScene): Map<string, EndMemory> {
  const movedElse = (id: string) => !s.dragged.includes(id) && !sameRect(s.before.get(id), s.rects.get(id))
  return new Map(
    s.lines.flatMap(l => {
      const m = s.memo.get(l.id)
      const ends = [l.from, l.to]
      if (!m || ends.some(id => s.displaced.includes(id))) return []
      if (s.reordered && ends.some(id => s.dragged.includes(id))) return []
      if (!s.settle.has(l.id) && ends.some(movedElse)) return []
      return [[l.id, m] as const]
    }),
  )
}

// 描いた線から、次に描くときに渡す記憶
export const memoryOf = (drawn: readonly DrawnLine[]): Map<string, EndMemory> =>
  new Map(drawn.flatMap(l => (l.memory ? [[l.id, l.memory] as const] : [])))
