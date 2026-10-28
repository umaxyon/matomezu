// ツリーの並べ方: 根と子の入れ子から、紙の上の節の四角と、親から子への線を決める（データに位置は持たない）。
// 根は伸びる向きで置く（上: 下辺の中央 / 下: 上辺の中央 / 左: 右辺の中央 / 右: 左辺の中央 / 中央: 紙の真ん中）。
// 子は親から伸びる向きへ間を空けて並べ、兄弟は横（伸びる向きに対して横）に並べる。親は子の並びの真ん中に置く。
// 中央の木は、根の直系の子がそれぞれの向き（side。無ければ右）へ伸び、孫より下は親の枝の向きに伸びる。
// 節の大きさはキャプション 1 行の幅（base のキャプションの幅。長いキャプションは … で切る）
import type { Point } from "../../../plugin-api"
import { captionTextWidth, TEXT_LOOK } from "../../base"
import type { Grow } from "./grow"
import { SIDE_NAMES, type Side, sideOf, type TreeNode, type TreeRoot } from "./node"

export const MARGIN = 24 // 根と紙の辺の間
const LEVEL = 40 // 親と子の間（伸びる向き）
const SIBLING_ACROSS_ROWS = 8 // 兄弟の間（左・右へ伸びる枝。上下に並ぶ）
const SIBLING_ACROSS_COLUMNS = 16 // 兄弟の間（上・下へ伸びる枝。左右に並ぶ）
const MIN_W = 32

export interface LaidNode {
  id: string
  caption: string
  x: number
  y: number
  w: number
  h: number
}

export interface TreeLayout {
  nodes: LaidNode[]
  lines: { from: Point; to: Point }[]
  fits: boolean // どの節も紙に収まるか
}

type Rect = { x: number; y: number; w: number; h: number }

export function nodeSize(caption: string): { w: number; h: number } {
  return {
    w: Math.max(MIN_W, captionTextWidth(caption) + TEXT_LOOK.padX * 2),
    h: TEXT_LOOK.line + TEXT_LOOK.padY * 2,
  }
}

const vertical = (side: Side) => side === "up" || side === "down"
const gapOf = (side: Side) => (vertical(side) ? SIBLING_ACROSS_COLUMNS : SIBLING_ACROSS_ROWS)

// 伸びる向きに沿った長さ（main）と、横の長さ（cross）で測った節と、その下の木の横の幅（span）
interface Measured {
  id: string
  caption: string
  main: number
  cross: number
  span: number
  children: Measured[]
}

const spanOf = (kids: readonly Measured[], side: Side) =>
  kids.reduce((sum, c) => sum + c.span, 0) + gapOf(side) * Math.max(0, kids.length - 1)

function measure(node: TreeNode, side: Side): Measured {
  const size = nodeSize(node.caption)
  const main = vertical(side) ? size.h : size.w
  const cross = vertical(side) ? size.w : size.h
  const children = (node.children ?? []).map(c => measure(c, side))
  return { id: node.id, caption: node.caption, main, cross, span: Math.max(cross, spanOf(children, side)), children }
}

// 四角 parent の side の辺から、子の並び kids を伸ばした節と線（parent 自身は含めない）
function branch(parent: Rect, kids: readonly TreeNode[], side: Side, out: TreeLayout) {
  const measured = kids.map(k => measure(k, side))
  if (measured.length === 0) return
  // 伸びる向きの位置 at（parent の辺から）と横の位置 across（parent の横の真ん中から）を、紙の上の点にする
  const toPaper = (at: number, across: number): Point => {
    const cx = parent.x + parent.w / 2
    const cy = parent.y + parent.h / 2
    if (side === "down") return { x: cx + across, y: parent.y + parent.h + at }
    if (side === "up") return { x: cx + across, y: parent.y - at }
    if (side === "right") return { x: parent.x + parent.w + at, y: cy + across }
    return { x: parent.x - at, y: cy + across }
  }
  const rectOf = (at: number, across: number, m: Measured): Rect => {
    const a = toPaper(at, across)
    const b = toPaper(at + m.main, across + m.cross)
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
  }
  const place = (n: Measured, at: number, start: number, from: Point) => {
    const across = start + (n.span - n.cross) / 2
    out.nodes.push({ id: n.id, caption: n.caption, ...rectOf(at, across, n) })
    out.lines.push({ from, to: toPaper(at, across + n.cross / 2) })
    const tip = toPaper(at + n.main, across + n.cross / 2)
    let next = start + (n.span - spanOf(n.children, side)) / 2
    for (const c of n.children) {
      place(c, at + n.main + LEVEL, next, tip)
      next += c.span + gapOf(side)
    }
  }
  let next = -spanOf(measured, side) / 2
  for (const m of measured) {
    place(m, LEVEL, next, toPaper(0, 0))
    next += m.span + gapOf(side)
  }
}

// 根の四角（伸びる向きで、紙の辺の中央か真ん中）
function rootRect(root: TreeRoot, grow: Grow, paper: { w: number; h: number }): Rect {
  const { w, h } = nodeSize(root.caption)
  if (grow === "down") return { x: (paper.w - w) / 2, y: MARGIN, w, h }
  if (grow === "up") return { x: (paper.w - w) / 2, y: paper.h - MARGIN - h, w, h }
  if (grow === "right") return { x: MARGIN, y: (paper.h - h) / 2, w, h }
  if (grow === "left") return { x: paper.w - MARGIN - w, y: (paper.h - h) / 2, w, h }
  return { x: (paper.w - w) / 2, y: (paper.h - h) / 2, w, h }
}

export function layoutTree(root: TreeRoot, grow: Grow, paper: { w: number; h: number }): TreeLayout {
  const r = rootRect(root, grow, paper)
  const out: TreeLayout = { nodes: [{ id: root.id, caption: root.caption, ...r }], lines: [], fits: true }
  const kids = root.children ?? []
  if (grow === "center")
    for (const side of SIDE_NAMES)
      branch(
        r,
        kids.filter(k => sideOf(k) === side),
        side,
        out,
      )
  else branch(r, kids, grow, out)
  out.fits = out.nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.w <= paper.w && n.y + n.h <= paper.h)
  return out
}
