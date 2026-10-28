// ツリーの並べ方: 根と子の入れ子から、紙の上の節の四角と、親から子への線を決める（データに位置は持たない）。
// 根は伸びる向きで置く（上: 下辺の中央 / 下: 上辺の中央 / 左: 右辺の中央 / 右: 左辺の中央 / 中央: 紙の真ん中）。
// 子は親から伸びる向きへ間を空けて並べ、兄弟は横（伸びる向きに対して横）に並べる。親は子の並びの真ん中に置く。
// 中央の木は、根の直系の子がそれぞれの向き（side。無ければ右）へ伸び、孫より下は親の枝の向きに伸びる。
// 中央の木で隣り合う向きの枝が重なるときは、紙の縦と横の短い方へ伸びる枝（横長の紙なら上下）を根の近くに置いたまま、
// 長い方へ伸びる枝（横長の紙なら左右）を、重ならない所まで根から離す。それで紙から出るなら、入る限り木全体を余裕のある側へずらす。
// 節の大きさは、節の大きさの選び方（節の size、無ければページで効いている選び方 size.ts）で決める: 伸びるはキャプション 1 行の幅、
// 折り返すは N 字の幅で折り返した行、最大で固定は N 字の幅まで（超えた分は … で切る）
import type { Point } from "../../../plugin-api"
import { clampLines, TEXT_LOOK, textWidth, wrap } from "../../base"
import type { Grow } from "./grow"
import { SIDE_NAMES, type Side, sideOf, type TreeNode, type TreeRoot } from "./node"
import { DEFAULT_NODE_SIZE, type NodeSize, sizeRule } from "./size"

export const MARGIN = 24 // 根と紙の辺の間
const LEVEL = 40 // 親と子の間（伸びる向き）
const SIBLING_ACROSS_ROWS = 8 // 兄弟の間（左・右へ伸びる枝。上下に並ぶ）
const SIBLING_ACROSS_COLUMNS = 16 // 兄弟の間（上・下へ伸びる枝。左右に並ぶ）
const MIN_W = 32

export interface LaidNode {
  id: string
  caption: string
  lines: string[] // 見せる行（折り返した行・… で切った行）
  body?: string[] // 根の本文の行（本文を描くときだけ）
  color?: string // 節の色（無ければテーマの塗り）
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

const FONT = TEXT_LOOK.caption
const FULL_WIDTH = "国" // 字の数で幅を決めるときの 1 字（全角）

// キャプションを大きさの選び方 size で見せる行と、節の大きさ
export function nodeSize(
  caption: string,
  size: NodeSize = DEFAULT_NODE_SIZE,
): { w: number; h: number; lines: string[] } {
  const { mode, chars } = sizeRule(size)
  const max = chars === null ? Number.POSITIVE_INFINITY : textWidth(FULL_WIDTH.repeat(chars), FONT)
  const one = caption.replace(/\n/g, " ")
  const lines =
    mode === "wrap"
      ? wrap(caption, max, FONT)
      : mode === "fixed"
        ? clampLines(wrap(one, max, FONT), 1, max, FONT)
        : [one]
  const shown = lines.length > 0 ? lines : [""]
  const w = Math.min(max, Math.max(...shown.map(l => textWidth(l, FONT))))
  return {
    w: Math.max(MIN_W, Math.ceil(w) + TEXT_LOOK.padX * 2),
    h: TEXT_LOOK.line * shown.length + TEXT_LOOK.padY * 2,
    lines: shown,
  }
}

const vertical = (side: Side) => side === "up" || side === "down"
const gapOf = (side: Side) => (vertical(side) ? SIBLING_ACROSS_COLUMNS : SIBLING_ACROSS_ROWS)

// 伸びる向きに沿った長さ（main）と、横の長さ（cross）で測った節と、その下の木の横の幅（span）
interface Measured {
  id: string
  caption: string
  lines: string[]
  color?: string
  main: number
  cross: number
  span: number
  children: Measured[]
}

const spanOf = (kids: readonly Measured[], side: Side) =>
  kids.reduce((sum, c) => sum + c.span, 0) + gapOf(side) * Math.max(0, kids.length - 1)

// 節 node（大きさの選び方は節の size、無ければ size）を測る
function measure(node: TreeNode, side: Side, size: NodeSize): Measured {
  const box = nodeSize(node.caption, node.size ?? size)
  const main = vertical(side) ? box.h : box.w
  const cross = vertical(side) ? box.w : box.h
  const children = (node.children ?? []).map(c => measure(c, side, size))
  const span = Math.max(cross, spanOf(children, side))
  const color = node.color ? { color: node.color } : {}
  return { id: node.id, caption: node.caption, lines: box.lines, ...color, main, cross, span, children }
}

// 四角 parent の side の辺から、子の並び kids を伸ばした節と線（parent 自身は含めない）。extra は、最初の段だけ parent から余分に離す長さ
function branch(parent: Rect, kids: readonly TreeNode[], side: Side, size: NodeSize, out: TreeLayout, extra = 0) {
  const measured = kids.map(k => measure(k, side, size))
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
    const color = n.color ? { color: n.color } : {}
    out.nodes.push({ id: n.id, caption: n.caption, lines: n.lines, ...color, ...rectOf(at, across, n) })
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
    place(m, LEVEL + extra, next, toPaper(0, 0))
    next += m.span + gapOf(side)
  }
}

const BODY_FONT = TEXT_LOOK.body
const BODY_GROWS_AT = 30 // 伸びる根の本文を折り返す字の数

// 根のキャプションの行と、本文を描くなら本文の行（大きさの選び方の N 字で折り返す。伸びるなら 30 字）と、根の大きさ
export function rootBox(root: TreeRoot, size: NodeSize): { w: number; h: number; lines: string[]; body?: string[] } {
  const head = nodeSize(root.caption, size)
  if (!root.showBody || !root.body) return head
  const chars = sizeRule(size).chars ?? BODY_GROWS_AT
  const max = textWidth(FULL_WIDTH.repeat(chars), BODY_FONT)
  const body = wrap(root.body, max, BODY_FONT)
  const widest = Math.max(...body.map(l => textWidth(l, BODY_FONT)))
  return {
    w: Math.max(head.w, Math.ceil(Math.min(max, widest)) + TEXT_LOOK.padX * 2),
    h: head.h + TEXT_LOOK.line * body.length + TEXT_LOOK.ruleGap * 2 + 1,
    lines: head.lines,
    body,
  }
}

// 根の四角（伸びる向きで、紙の辺の中央か真ん中。大きさは box）
function rootRect(box: { w: number; h: number }, grow: Grow, paper: { w: number; h: number }): Rect {
  const { w, h } = box
  if (grow === "down") return { x: (paper.w - w) / 2, y: MARGIN, w, h }
  if (grow === "up") return { x: (paper.w - w) / 2, y: paper.h - MARGIN - h, w, h }
  if (grow === "right") return { x: MARGIN, y: (paper.h - h) / 2, w, h }
  if (grow === "left") return { x: paper.w - MARGIN - w, y: (paper.h - h) / 2, w, h }
  return { x: (paper.w - w) / 2, y: (paper.h - h) / 2, w, h }
}

const KEEP_APART = 8 // ずらした枝と、根の近くの枝の節の間

// 枝の節 nodes を side へどれだけ離せば、ほかの節 fixed と重ならないか（横の範囲が重なる組だけを見る。重ならなければ 0）
function pushOut(nodes: readonly Rect[], fixed: readonly Rect[], side: Side): number {
  let need = 0
  for (const n of nodes)
    for (const f of fixed) {
      const across = vertical(side)
        ? n.x < f.x + f.w + KEEP_APART && f.x < n.x + n.w + KEEP_APART
        : n.y < f.y + f.h + KEEP_APART && f.y < n.y + n.h + KEEP_APART
      if (!across) continue
      if (side === "right") need = Math.max(need, f.x + f.w + KEEP_APART - n.x)
      if (side === "left") need = Math.max(need, n.x + n.w + KEEP_APART - f.x)
      if (side === "down") need = Math.max(need, f.y + f.h + KEEP_APART - n.y)
      if (side === "up") need = Math.max(need, n.y + n.h + KEEP_APART - f.y)
    }
  return need
}

// 木全体の四角が紙に入るなら、紙からはみ出た分だけ、木全体を入る側へずらす（入らなければそのまま）
function shiftInto(out: TreeLayout, paper: { w: number; h: number }) {
  const x0 = Math.min(...out.nodes.map(n => n.x))
  const y0 = Math.min(...out.nodes.map(n => n.y))
  const x1 = Math.max(...out.nodes.map(n => n.x + n.w))
  const y1 = Math.max(...out.nodes.map(n => n.y + n.h))
  const into = (lo: number, hi: number, size: number) => (hi - lo > size ? 0 : lo < 0 ? -lo : hi > size ? size - hi : 0)
  const dx = into(x0, x1, paper.w)
  const dy = into(y0, y1, paper.h)
  if (dx === 0 && dy === 0) return
  for (const n of out.nodes) {
    n.x += dx
    n.y += dy
  }
  out.lines = out.lines.map(l => ({
    from: { x: l.from.x + dx, y: l.from.y + dy },
    to: { x: l.to.x + dx, y: l.to.y + dy },
  }))
}

// size はページで効いている節の大きさの選び方（節が自分で選んでいなければ、これに従う）
export function layoutTree(
  root: TreeRoot,
  grow: Grow,
  paper: { w: number; h: number },
  size: NodeSize = DEFAULT_NODE_SIZE,
): TreeLayout {
  const box = rootBox(root, size)
  const r = rootRect(box, grow, paper)
  const out: TreeLayout = {
    nodes: [
      {
        id: root.id,
        caption: root.caption,
        lines: box.lines,
        ...(box.body ? { body: box.body } : {}),
        ...(root.color ? { color: root.color } : {}),
        ...r,
      },
    ],
    lines: [],
    fits: true,
  }
  const kids = root.children ?? []
  if (grow === "center") {
    const group = (side: Side) => kids.filter(k => sideOf(k) === side)
    const stays: Side[] = paper.w >= paper.h ? ["up", "down"] : ["left", "right"]
    for (const side of stays) branch(r, group(side), side, size, out)
    const near = out.nodes.slice(1)
    for (const side of SIDE_NAMES.filter(s => !stays.includes(s))) {
      const trial: TreeLayout = { nodes: [], lines: [], fits: true }
      branch(r, group(side), side, size, trial)
      branch(r, group(side), side, size, out, pushOut(trial.nodes, near, side))
    }
    shiftInto(out, paper)
  } else branch(r, kids, grow, size, out)
  out.fits = out.nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.w <= paper.w && n.y + n.h <= paper.h)
  return out
}
