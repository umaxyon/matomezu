// ツリーの並べ方: 根と子の入れ子から、紙の上の節の四角と、親から子への線を決める（データに位置は持たない）。
// 根は伸びる向きで置く（上: 下辺の中央 / 下: 上辺の中央 / 左: 右辺の中央 / 右: 左辺の中央 / 中央: 紙の真ん中）。
// 子は親から伸びる向きへ間を空けて並べ、兄弟は横（伸びる向きに対して横）に並べる。親は子の並びの真ん中に置く。
// 中央の木は、子を右へ伸ばす。
// 節の大きさはキャプション 1 行の幅（base のキャプションの幅。長いキャプションは … で切る）
import type { Point } from "../../../plugin-api"
import { captionTextWidth, TEXT_LOOK } from "../../base"
import type { Grow } from "./grow"
import type { TreeNode, TreeRoot } from "./node"

export const MARGIN = 24 // 根と紙の辺の間
const LEVEL = 40 // 親と子の間（伸びる向き）
const SIBLING_ACROSS_ROWS = 8 // 兄弟の間（左・右・中央の木。上下に並ぶ）
const SIBLING_ACROSS_COLUMNS = 16 // 兄弟の間（上・下の木。左右に並ぶ）
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

export function nodeSize(caption: string): { w: number; h: number } {
  return {
    w: Math.max(MIN_W, captionTextWidth(caption) + TEXT_LOOK.padX * 2),
    h: TEXT_LOOK.line + TEXT_LOOK.padY * 2,
  }
}

// 伸びる向きに沿った長さ（main）と、横の長さ（cross）で測った節と、その下の木の横の幅（span）
interface Measured {
  id: string
  caption: string
  main: number
  cross: number
  span: number
  children: Measured[]
}

const vertical = (grow: Grow) => grow === "up" || grow === "down"

function measure(node: { id: string; caption: string; children?: TreeNode[] }, grow: Grow): Measured {
  const size = nodeSize(node.caption)
  const main = vertical(grow) ? size.h : size.w
  const cross = vertical(grow) ? size.w : size.h
  const children = (node.children ?? []).map(c => measure(c, grow))
  const gap = vertical(grow) ? SIBLING_ACROSS_COLUMNS : SIBLING_ACROSS_ROWS
  const spans = children.reduce((sum, c) => sum + c.span, 0) + gap * Math.max(0, children.length - 1)
  return { id: node.id, caption: node.caption, main, cross, span: Math.max(cross, spans), children }
}

// 根から伸びる向きに沿った位置（at。根の手前の辺が 0）と、横の位置（across。根の横の真ん中が 0）で置いた節
interface Placed {
  id: string
  caption: string
  at: number
  across: number // 節の横の始まり
  main: number
  cross: number
}

export function layoutTree(root: TreeRoot, grow: Grow, paper: { w: number; h: number }): TreeLayout {
  const m = measure(root, grow)
  const gap = vertical(grow) ? SIBLING_ACROSS_COLUMNS : SIBLING_ACROSS_ROWS
  const placed: Placed[] = []
  const links: [Placed, Placed][] = []
  const place = (n: Measured, at: number, start: number): Placed => {
    const self: Placed = {
      id: n.id,
      caption: n.caption,
      at,
      across: start + (n.span - n.cross) / 2,
      main: n.main,
      cross: n.cross,
    }
    placed.push(self)
    const spans = n.children.reduce((sum, c) => sum + c.span, 0) + gap * Math.max(0, n.children.length - 1)
    let next = start + (n.span - spans) / 2
    for (const c of n.children) {
      links.push([self, place(c, at + n.main + LEVEL, next)])
      next += c.span + gap
    }
    return self
  }
  const rootPlaced = place(m, 0, -m.span / 2)
  const shift = rootPlaced.across + rootPlaced.cross / 2 // 根の横の真ん中を 0 にする
  // 伸びる向きの位置と横の位置を、紙の上の点にする
  const toPaper = (at: number, across: number): Point => {
    const c = across - shift
    switch (grow) {
      case "down":
        return { x: paper.w / 2 + c, y: MARGIN + at }
      case "up":
        return { x: paper.w / 2 + c, y: paper.h - MARGIN - at }
      case "right":
        return { x: MARGIN + at, y: paper.h / 2 + c }
      case "left":
        return { x: paper.w - MARGIN - at, y: paper.h / 2 + c }
      case "center":
        return { x: paper.w / 2 - m.main / 2 + at, y: paper.h / 2 + c }
    }
  }
  const nodes = placed.map(p => {
    const a = toPaper(p.at, p.across)
    const b = toPaper(p.at + p.main, p.across + p.cross)
    return {
      id: p.id,
      caption: p.caption,
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    }
  })
  const lines = links.map(([parent, child]) => ({
    from: toPaper(parent.at + parent.main, parent.across + parent.cross / 2),
    to: toPaper(child.at, child.across + child.cross / 2),
  }))
  const fits = nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.w <= paper.w && n.y + n.h <= paper.h)
  return { nodes, lines, fits }
}
