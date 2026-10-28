// 節のドラッグで落とす先: 紙の上の点に、どの親の子の何番目として入るか（付け替えと、兄弟の順番の入れ替え）と、その印。
// 節の真ん中に落とせば、その節の子の末尾へ。兄弟の並びの向きで節の端の近く（節の外の少しまで）なら、その前か後ろへ兄弟として。
// 中央の木の根に落とせば、根の真ん中から見た向きへ伸びる子に。動かす節と、その子孫には落とせない。
// ドラッグの間、ポインタが表示領域の端に近ければ、その向きへ紙をずらす量（edgeScroll）
import type { Point } from "../../../plugin-api"
import { edgeSpeed } from "../../base"
import { nodeOf, pathTo } from "./edit"
import type { Grow } from "./grow"
import type { LaidNode } from "./layout"
import { type Side, sideOf, type TreeNode, type TreeRoot } from "./node"

export interface Drop {
  parent: string
  index?: number // 動かす節を除いた並びの何番目（無ければ末尾）
  side?: Side // 中央の木の根の直系の子になるときの向き
  // 印: 子として入る節（into）か、兄弟の間に入る所の線（between）
  mark: { kind: "into"; node: string } | { kind: "between"; from: Point; to: Point }
}

// 兄弟の並びの向きに、節の外へ当たりを広げる長さ
export const DROP_PAD = 8
// 兄弟の間に入る所の線を、節の辺から離す長さ
const LINE_GAP = 4
// 節の端から、兄弟として入る範囲（並びの向きの長さの割合）
const EDGE = 0.25

const vertical = (side: Side) => side === "up" || side === "down"

// 節 id と、その子孫の id
export function subtreeIds(node: TreeNode): Set<string> {
  const ids = new Set<string>([node.id])
  for (const c of node.children ?? []) for (const id of subtreeIds(c)) ids.add(id)
  return ids
}

// 中央の木の根 r の真ん中から見た、点 at の向き（縦横の比で比べる）
function sideFrom(r: LaidNode, at: Point): Side {
  const dx = (at.x - (r.x + r.w / 2)) / r.w
  const dy = (at.y - (r.y + r.h / 2)) / r.h
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right"
  return dy < 0 ? "up" : "down"
}

// 根 root・伸びる向き grow で並べた節 nodes の上で、節 dragged を点 at（紙の座標）に落とす先（落とせなければ null）
export function dropAt(
  root: TreeRoot,
  grow: Grow,
  nodes: readonly LaidNode[],
  dragged: string,
  at: Point,
): Drop | null {
  const moving = nodeOf(root, dragged)
  if (!moving) return null
  const skip = subtreeIds(moving)
  for (const n of nodes) {
    if (skip.has(n.id)) continue
    if (n.id === root.id) {
      const inside = at.x >= n.x && at.x <= n.x + n.w && at.y >= n.y && at.y <= n.y + n.h
      if (!inside) continue
      return {
        parent: root.id,
        ...(grow === "center" ? { side: sideFrom(n, at) } : {}),
        mark: { kind: "into", node: n.id },
      }
    }
    const path = pathTo(root, n.id)
    const parent = path?.at(-1)
    const self = nodeOf(root, n.id)
    if (!path || !parent || !self) continue
    // この節の枝が伸びる向き（中央の木は根の直系の子の向き）。兄弟は、その横に並ぶ
    const top = path[1] ? nodeOf(root, path[1].id) : self
    const dir = grow === "center" ? sideOf(top ?? self) : grow
    const acrossX = vertical(dir)
    const start = acrossX ? n.x : n.y
    const length = acrossX ? n.w : n.h
    const pos = acrossX ? at.x : at.y
    const other = acrossX ? at.y : at.x
    const otherStart = acrossX ? n.y : n.x
    const otherLength = acrossX ? n.h : n.w
    if (other < otherStart || other > otherStart + otherLength) continue
    if (pos < start - DROP_PAD || pos > start + length + DROP_PAD) continue
    const t = (pos - start) / length
    if (t >= EDGE && t <= 1 - EDGE) return { parent: n.id, mark: { kind: "into", node: n.id } }
    const before = t < EDGE
    const kids = (parent.children ?? []).filter(c => c.id !== dragged)
    const i = kids.findIndex(c => c.id === n.id)
    const edge = before ? start - LINE_GAP : start + length + LINE_GAP
    const from = acrossX ? { x: edge, y: n.y } : { x: n.x, y: edge }
    const to = acrossX ? { x: edge, y: n.y + n.h } : { x: n.x + n.w, y: edge }
    return {
      parent: parent.id,
      index: before ? i : i + 1,
      ...(grow === "center" && parent.id === root.id ? { side: sideOf(self) } : {}),
      mark: { kind: "between", from, to },
    }
  }
  return null
}

// 大きさ view の表示領域の中の点 p（左上から）で、dt 秒の間に紙をずらす量（速さは base の edgeSpeed。端に近くなければ 0）。
// 左の端では右へ（左にある物が見えてくる向き）ずらす
export function edgeScroll(p: Point, view: { w: number; h: number }, dt: number): Point {
  return { x: -edgeSpeed(p.x, 0, view.w) * dt, y: -edgeSpeed(p.y, 0, view.h) * dt }
}

// ドラッグの間、紙をずらし続ける繰り返し: follow でポインタの所（画面の座標）を渡すと、表示領域 area（画面の座標の四角）の端の近くにある間、
// コマごとに pan でずらす（ずらす量は前のコマからの時間で決める。ポインタを動かさなくても続き、端を離れたら止まる）。stop でやめる
export function edgePanner(
  area: () => { x: number; y: number; w: number; h: number } | null,
  pan: (dx: number, dy: number) => void,
) {
  let frame = 0
  let prev = 0 // 前にずらした時刻（0 は止まっていた）
  let pointer: Point | null = null
  const tick = (now: number) => {
    frame = 0
    const r = area()
    if (!pointer || !r) return
    // 前のコマからの時間（止まっていたら 1 コマ分。間が空いても一度に飛ばない）
    const dt = Math.min(prev ? now - prev : 16, 50) / 1000
    const by = edgeScroll({ x: pointer.x - r.x, y: pointer.y - r.y }, { w: r.w, h: r.h }, dt)
    if (by.x === 0 && by.y === 0) {
      prev = 0
      return
    }
    prev = now
    pan(by.x, by.y)
    frame = requestAnimationFrame(tick)
  }
  return {
    follow(p: Point) {
      pointer = p
      if (!frame) frame = requestAnimationFrame(tick)
    },
    stop() {
      pointer = null
      prev = 0
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    },
  }
}
