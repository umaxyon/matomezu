// ツリーのページの印刷: 木を並べ（layout.ts。ビューと同じ並べ方と座標）、可変ページなら節が入るだけ並べた印刷区画の数と、節が載る印刷区画を返す（見せ方の printSheets）。
// 線は節から決まるので数えない。印刷では、印刷区画の境目をまたぐ節とそれより先を次の印刷区画へ送る（改ページ。printLaid）
import type { CoreCatalog, ItemPage, Point, Size } from "../../../plugin-api"
import {
  breakShift,
  type GrowSides,
  grownArea,
  type PrintSheets,
  paperSize,
  printSheetsOf,
  type SettingReader,
  type SheetPurpose,
} from "../../base"
import { GROW } from "./grow"
import { laidExtent, layoutTree, MARGIN, type TreeLayout } from "./layout"
import { type TreeRoot, treeRootOf } from "./node"
import { NODE_SHAPE } from "./shape"
import { NODE_SIZE } from "./size"

// ページ page の木を並べたもの（描けない紙と根の無いページは null）。setting はそのページで効いている設定の値、grow はページの増やす向き。
// root は並べる木（書く画面の、書いている字を重ねた木など。無ければページの根）
export function laidPage(
  catalog: CoreCatalog,
  page: ItemPage,
  { setting, grow }: { setting: SettingReader; grow: GrowSides | undefined },
  root: TreeRoot | undefined = treeRootOf(page),
): TreeLayout | null {
  const paper = paperSize(catalog, page)
  return root && paper ? layoutTree(root, setting(GROW), paper, setting(NODE_SIZE), setting(NODE_SHAPE), grow) : null
}

// 可変ページで、並べた木 laid の節が入るだけ印刷区画を並べた数と広さ（spare なら、増やす向きに空きの印刷区画を足す。書く画面がステージに知らせる広さ）
export const laidArea = (paper: Size, grow: GrowSides, laid: TreeLayout, spare: boolean) =>
  grownArea(paper, grow, laidExtent(laid.nodes), spare)

// 印刷のときの並べ方: 可変ページなら、印刷区画の境目をまたぐ節と、それより先（右・下）の節と線を、次の印刷区画の頭（余白 MARGIN の内側）まで
// 送る（改ページ。横と縦のそれぞれで。書く画面の並びは変えない）
export function printLaid(
  catalog: CoreCatalog,
  page: ItemPage,
  on: { setting: SettingReader; grow: GrowSides | undefined },
): TreeLayout | null {
  const laid = laidPage(catalog, page, on)
  const paper = paperSize(catalog, page)
  if (!laid || !paper || !on.grow) return laid
  const dx = breakShift(
    laid.nodes.map(n => ({ at: n.x, size: n.w })),
    paper.w,
    MARGIN,
  )
  const dy = breakShift(
    laid.nodes.map(n => ({ at: n.y, size: n.h })),
    paper.h,
    MARGIN,
  )
  // 線の端は、つないでいる節と同じだけ送る（端の点の位置で決めると、ほかの節の改ページの分だけ節から離れることがある）
  const shifts = new Map(laid.nodes.map(n => [n.id, { x: dx(n.x), y: dy(n.y) }]))
  const moved = (p: Point, node: string): Point => {
    const d = shifts.get(node) ?? { x: 0, y: 0 }
    return { x: p.x + d.x, y: p.y + d.y }
  }
  return {
    ...laid,
    nodes: laid.nodes.map(n => ({ ...n, x: n.x + dx(n.x), y: n.y + dy(n.y) })),
    lines: laid.lines.map(l => ({ ...l, from: moved(l.from, l.parent), to: moved(l.to, l.child) })),
  }
}

export function treePrintSheets(
  catalog: CoreCatalog,
  page: ItemPage,
  on: { setting: SettingReader; grow: GrowSides | undefined; purpose: SheetPurpose },
): PrintSheets {
  const laid = on.purpose === "print" ? printLaid(catalog, page, on) : laidPage(catalog, page, on)
  const paper = paperSize(catalog, page)
  if (!laid || !paper) return { columns: 1, rows: 1, filled: new Set() }
  return printSheetsOf(paper, laid.nodes, on.grow, laidExtent(laid.nodes))
}
