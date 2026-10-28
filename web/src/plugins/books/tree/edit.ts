// ツリーを組み立てる計算（データを書き換えず、新しい根を返す）: 節を足す・子のキャプションを替える・子孫ごと消す、と、
// 上下左右のキーで動いた先の節（伸びる向きのキーで最初の子へ、逆向きで親へ、横向きで隣の兄弟へ）
import type { Grow } from "./grow"
import type { TreeNode, TreeRoot } from "./node"

// 根も子も、id と子の並びで扱う
type Node = TreeRoot | TreeNode

// 子の並びを kids に替えた節（子が無くなれば children も消す）
function withKids<N extends { children?: TreeNode[] }>(
  n: N,
  kids: TreeNode[],
): Omit<N, "children"> & { children?: TreeNode[] } {
  const { children: _old, ...rest } = n
  return kids.length > 0 ? { ...rest, children: kids } : rest
}

// 節 id と、そこまでの親の並び（根から。根そのものなら空。無ければ null）
export function pathTo(root: TreeRoot, id: string): Node[] | null {
  if (root.id === id) return []
  const walk = (node: Node, up: Node[]): Node[] | null => {
    for (const c of node.children ?? []) {
      if (c.id === id) return [...up, node]
      const found = walk(c, [...up, node])
      if (found) return found
    }
    return null
  }
  return walk(root, [])
}

// 節 id（根を除く）
function nodeOf(root: TreeRoot, id: string): TreeNode | null {
  const parent = pathTo(root, id)?.at(-1)
  return parent?.children?.find(c => c.id === id) ?? null
}

// 子の並び nodes の中の節 id を f で替えた並び（無ければ null）
function mapIn(nodes: readonly TreeNode[], id: string, f: (n: TreeNode) => TreeNode): TreeNode[] | null {
  for (const [i, n] of nodes.entries()) {
    const kids = n.id === id ? null : n.children && mapIn(n.children, id, f)
    const next = n.id === id ? f(n) : kids && { ...n, children: kids }
    if (next) return nodes.map((c, j) => (j === i ? next : c))
  }
  return null
}

// 子の並び kids の index の所（無ければ末尾）に nodes を足した並び（範囲の外なら null）
function inserted(kids: readonly TreeNode[], nodes: readonly TreeNode[], index?: number): TreeNode[] | null {
  const at = index ?? kids.length
  return at < 0 || at > kids.length ? null : [...kids.slice(0, at), ...nodes, ...kids.slice(at)]
}

// 節 parent（根も）の子の index の所（無ければ末尾）に nodes を足した根（親が無い・index が範囲の外なら null）
export function addNodes(root: TreeRoot, parent: string, nodes: readonly TreeNode[], index?: number): TreeRoot | null {
  if (root.id === parent) {
    const kids = inserted(root.children ?? [], nodes, index)
    return kids && withKids(root, kids)
  }
  const target = nodeOf(root, parent)
  const kids = target && inserted(target.children ?? [], nodes, index)
  const next = kids && mapIn(root.children ?? [], parent, n => withKids(n, kids))
  return next && withKids(root, next)
}

// 子の節 id のキャプションを替えた根（根のキャプションはページのフィールドの受け方で替える。無ければ null）
export function captionNode(root: TreeRoot, id: string, caption: string): TreeRoot | null {
  const next = mapIn(root.children ?? [], id, n => ({ ...n, caption }))
  return next && withKids(root, next)
}

// 子の並び nodes から節 id を子孫ごと除いた並び（無ければ null）
function removedIn(nodes: readonly TreeNode[], id: string): TreeNode[] | null {
  if (nodes.some(n => n.id === id)) return nodes.filter(n => n.id !== id)
  for (const [i, n] of nodes.entries()) {
    const kids = n.children && removedIn(n.children, id)
    if (kids) return nodes.map((c, j) => (j === i ? withKids(c, kids) : c))
  }
  return null
}

// 節 id を子孫ごと消した根（根は消せない。無ければ null）
export function removeNode(root: TreeRoot, id: string): TreeRoot | null {
  const next = removedIn(root.children ?? [], id)
  return next && withKids(root, next)
}

// 節 id を消したあとに選ぶ節: 前の兄弟、無ければ親（根と無い節は null）
export function afterRemove(root: TreeRoot, id: string): string | null {
  const parent = pathTo(root, id)?.at(-1)
  if (!parent) return null
  const kids = parent.children ?? []
  const i = kids.findIndex(c => c.id === id)
  return kids[i - 1]?.id ?? parent.id
}

export type Arrow = "up" | "down" | "left" | "right"

// 伸びる向きのキー（中央の木は右へ伸ばすので右）
const FORWARD: Record<Grow, Arrow> = { up: "up", down: "down", left: "left", right: "right", center: "right" }
const BACK: Record<Arrow, Arrow> = { up: "down", down: "up", left: "right", right: "left" }

// 節 id から、キー arrow で動いた先の節（動けなければ id のまま）。兄弟は並べた順（上・下の木は左から、左・右・中央の木は上から）
export function moveFrom(root: TreeRoot, grow: Grow, id: string, arrow: Arrow): string {
  const path = pathTo(root, id)
  if (!path) return id
  const forward = FORWARD[grow]
  const node = path.length === 0 ? root : nodeOf(root, id)
  if (arrow === forward) return node?.children?.[0]?.id ?? id
  const parent = path.at(-1)
  if (!parent) return id
  if (arrow === BACK[forward]) return parent.id
  const kids = parent.children ?? []
  const i = kids.findIndex(c => c.id === id)
  const across = forward === "up" || forward === "down" ? { prev: "left", next: "right" } : { prev: "up", next: "down" }
  const to = arrow === across.prev ? kids[i - 1] : arrow === across.next ? kids[i + 1] : undefined
  return to?.id ?? id
}

// 選んでいる節: ステージの選択の最初の節（ページの木に無ければ根）。編集の道具の間は、いつもどれかの節を選んでいる
export function selectedIn(root: TreeRoot, selection: readonly string[]): string {
  const first = selection[0]
  return first !== undefined && pathTo(root, first) ? first : root.id
}

// 紙の上の四角 rect の真ん中を、大きさ view のビューの真ん中に持ってくる、ずらす量（at は紙の置き場所。紙の端で止めるのはステージの側）。
// 1px 未満しかずれていなければ null（ずらさない）
export function centerShift(
  rect: { x: number; y: number; w: number; h: number },
  view: { w: number; h: number },
  at: { x: number; y: number; zoom: number },
): { dx: number; dy: number } | null {
  const dx = view.w / 2 - (at.x + (rect.x + rect.w / 2) * at.zoom)
  const dy = view.h / 2 - (at.y + (rect.y + rect.h / 2) * at.zoom)
  return Math.abs(dx) >= 1 || Math.abs(dy) >= 1 ? { dx, dy } : null
}

// 節 id の＋: どの辺（side）に出し、押すとどの親（parent）の子の何番目（index。無ければ末尾）に足すか。
// 伸びる向きの辺は子を足す（子があれば、その末尾に）。根でない節は、横の 2 辺に、すぐ前とすぐ後ろに兄弟を足す＋も出す
export interface Plus {
  kind: "child" | "before" | "after"
  side: Arrow
  parent: string
  index?: number
}

export function plusesOf(root: TreeRoot, grow: Grow, id: string): Plus[] {
  const path = pathTo(root, id)
  if (!path) return []
  const forward = FORWARD[grow]
  const child: Plus = { kind: "child", side: forward, parent: id }
  const parent = path.at(-1)
  if (!parent) return [child]
  const i = (parent.children ?? []).findIndex(c => c.id === id)
  const across: [Arrow, Arrow] = forward === "up" || forward === "down" ? ["left", "right"] : ["up", "down"]
  return [
    child,
    { kind: "before", side: across[0], parent: parent.id, index: i },
    { kind: "after", side: across[1], parent: parent.id, index: i + 1 },
  ]
}

// 節 id のキャプション（根も。無ければ空）
export function captionOf(root: TreeRoot, id: string): string {
  if (root.id === id) return root.caption
  return (
    pathTo(root, id)
      ?.at(-1)
      ?.children?.find(c => c.id === id)?.caption ?? ""
  )
}

// 節 id（根も）のキャプションを caption に替えた根（書いている字で並べるため。無い節なら元の根）
export const withCaption = (root: TreeRoot, id: string, caption: string): TreeRoot =>
  root.id === id ? { ...root, caption } : (captionNode(root, id, caption) ?? root)

// ＋を出す所: 節の四角 rect の辺 side の真ん中から、外へ PLUS_GAP 離した所
export const PLUS_GAP = 14
export function plusPoint(rect: { x: number; y: number; w: number; h: number }, side: Arrow): { x: number; y: number } {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  if (side === "up") return { x: cx, y: rect.y - PLUS_GAP }
  if (side === "down") return { x: cx, y: rect.y + rect.h + PLUS_GAP }
  if (side === "left") return { x: rect.x - PLUS_GAP, y: cy }
  return { x: rect.x + rect.w + PLUS_GAP, y: cy }
}

// その場の編集を終えたときにすること: 書いた字 text（取り消しなら null）で、節 id を
// 消す（キャプションの空の子が空のまま終わった）・根のキャプションを替える・子のキャプションを替える・何もしない（変わらない・今ある節を空にした）
export type EditEnd = { kind: "remove" } | { kind: "root" | "child"; caption: string } | { kind: "none" }

export function editEnd(root: TreeRoot, id: string, text: string | null): EditEnd {
  const old = captionOf(root, id)
  const isRoot = root.id === id
  const next = text ?? old
  if (next === "") return !isRoot && old === "" ? { kind: "remove" } : { kind: "none" }
  if (next === old) return { kind: "none" }
  return { kind: isRoot ? "root" : "child", caption: next }
}
