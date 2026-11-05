// ツリーのページの印刷: 木を並べ（layout.ts。ビューと同じ並べ方と座標）、可変ページなら節が入るだけ並べた印刷区画の数と、節が載る印刷区画を返す（見せ方の printSheets）。
// 線は節から決まるので数えない
import type { CoreCatalog, ItemPage, Size } from "../../../plugin-api"
import {
  type GrowSides,
  grownArea,
  type PrintSheets,
  paperSize,
  type SettingReader,
  sheetKey,
  sheetsOfShape,
} from "../../base"
import { GROW } from "./grow"
import { laidExtent, layoutTree, type TreeLayout } from "./layout"
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

export function treePrintSheets(
  catalog: CoreCatalog,
  page: ItemPage,
  on: { setting: SettingReader; grow: GrowSides | undefined },
): PrintSheets {
  const laid = laidPage(catalog, page, on)
  const paper = paperSize(catalog, page)
  if (!laid || !paper) return { columns: 1, rows: 1, filled: null }
  const filled = new Set(laid.nodes.flatMap(n => sheetsOfShape(n, paper).map(c => sheetKey(c.column, c.row))))
  if (!on.grow) return { columns: 1, rows: 1, filled }
  const { columns, rows } = laidArea(paper, on.grow, laid, false)
  return { columns, rows, filled }
}
